// app.js - page bootstrap: load lessons, wire the typing engine, virtual keyboard
// and stats, and report progress to the backend on finish.
//
// 身份（多档案）机制：
//   - 每个"身份"是一个本地随机串（profile_id）+ 一个仅存本机的名称。
//   - 随机串缓存在 localStorage，保存成绩时作为 profile_id 一起发往接口；
//     接口只接收这个串，不接收名称（名称纯本地）。
//   - 切换身份后，进度按 profile_id 隔离查询，互不可见。
//   - 历史无身份记录（升级前）会被后端认领到固定 'legacy' 身份，初始化时作为
//     "历史记录"档案出现，旧成绩不会丢。
(function () {
  const lessonList = document.getElementById("lessonList");
  const playArea = document.getElementById("playArea");
  const textDisplay = document.getElementById("textDisplay");
  const keyboardEl = document.getElementById("keyboard");
  const hint = document.getElementById("hint");
  const resultModal = document.getElementById("resultModal");
  const resultStats = document.getElementById("resultStats");
  const statTime = document.getElementById("statTime");
  const statWpm = document.getElementById("statWpm");
  const statAcc = document.getElementById("statAcc");
  const statProg = document.getElementById("statProg");

  // 身份管理相关 DOM
  const profileList = document.getElementById("profileList");
  const btnAddProfile = document.getElementById("btnAddProfile");
  const btnRenameProfile = document.getElementById("btnRenameProfile");
  const btnDeleteProfile = document.getElementById("btnDeleteProfile");

  let engine = null;
  let lessons = [];
  let currentLesson = null;
  let summary = {}; // { lesson_id: {attempts, best_wpm, avg_accuracy} }

  // —— 身份（多档案）本地存储 ——
  const PROFILES_KEY = "keybuddy_profiles";
  const CURRENT_KEY = "keybuddy_current";
  const LEGACY_ID = "legacy"; // 后端迁移时认领历史记录用的固定身份
  let profiles = [];      // [{ id, name }]
  let currentProfile = ""; // 当前身份的随机串

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function saveProfiles() {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) {}
  }
  function loadProfiles() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (raw) profiles = JSON.parse(raw);
    } catch (e) { profiles = []; }
    if (!Array.isArray(profiles) || !profiles.length) {
      // 首次打开：默认"打字小白" + 历史记录档案
      profiles = [
        { id: newId(), name: "打字小白" },
        { id: LEGACY_ID, name: "历史记录" }
      ];
      saveProfiles();
    }
    let cur = "";
    try { cur = localStorage.getItem(CURRENT_KEY) || ""; } catch (e) {}
    if (!cur || !profiles.some(function (p) { return p.id === cur; })) {
      cur = profiles[0].id;
      try { localStorage.setItem(CURRENT_KEY, cur); } catch (e) {}
    }
    currentProfile = cur;
  }
  function currentName() {
    const p = profiles.find(function (x) { return x.id === currentProfile; });
    return p ? p.name : "打字小白";
  }
  function renderProfileBar() {
    profileList.innerHTML = "";
    profiles.forEach(function (p) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "profile-pill" + (p.id === currentProfile ? " active" : "");

      const av = document.createElement("span");
      av.className = "avatar";
      av.textContent = (p.name || "?").trim().charAt(0) || "?";

      const nm = document.createElement("span");
      nm.className = "pname";
      nm.textContent = p.name;

      pill.appendChild(av);
      pill.appendChild(nm);
      pill.addEventListener("click", function () {
        if (currentProfile === p.id) return;
        currentProfile = p.id;
        try { localStorage.setItem(CURRENT_KEY, currentProfile); } catch (e) {}
        renderProfileBar();
        loadProgress(function () { renderLessons(lessons); });
      });
      profileList.appendChild(pill);
    });
  }
  function wireProfileEvents() {
    btnAddProfile.addEventListener("click", function () {
      const name = window.prompt("给新身份起个名字：", "新身份");
      if (name === null) return;
      const clean = name.trim() || "新身份";
      const id = newId();
      profiles.push({ id: id, name: clean });
      currentProfile = id;
      saveProfiles();
      try { localStorage.setItem(CURRENT_KEY, id); } catch (e) {}
      renderProfileBar();
      loadProgress(function () { renderLessons(lessons); });
    });
    btnRenameProfile.addEventListener("click", function () {
      const name = window.prompt("修改当前身份名称（仅存本机）：", currentName());
      if (name === null) return;
      const clean = name.trim();
      if (!clean) return;
      const p = profiles.find(function (x) { return x.id === currentProfile; });
      if (p) { p.name = clean; saveProfiles(); renderProfileBar(); }
    });
    btnDeleteProfile.addEventListener("click", function () {
      if (profiles.length <= 1) {
        window.alert("至少保留一个身份，无法删除。");
        return;
      }
      if (!window.confirm("删除当前身份「" + currentName() + "」？\n（仅本机移除，已保存的成绩仍留在数据库，可重新建立同名身份继续查看）")) return;
      profiles = profiles.filter(function (x) { return x.id !== currentProfile; });
      currentProfile = profiles[0].id;
      saveProfiles();
      try { localStorage.setItem(CURRENT_KEY, currentProfile); } catch (e) {}
      renderProfileBar();
      loadProgress(function () { renderLessons(lessons); });
    });
  }

  // 按当前身份加载进度汇总
  function loadProgress(cb) {
    fetch("/api/v1/progress?profile_id=" + encodeURIComponent(currentProfile))
      .then(function (r) { return r.json(); })
      .then(function (pd) {
        summary = (pd && pd.Data && pd.Data.by_lesson) || {};
        if (cb) cb();
      })
      .catch(function () { if (cb) cb(); });
  }

  // Unified input entry, shared by the physical keyboard and on-screen taps.
  // 虚拟点按通常只给 key（如 "A"/" "），这里自动补上物理 code，
  // 与真实键盘的 event.code 统一走 handleType 的 code 比对，避免"点对键却判错"。
  window.dispatchTypingKey = function (key, code) {
    if (!engine || playArea.hidden) return;
    const resolvedCode = code !== undefined ? code
      : (typeof window.keyToCode === "function" ? window.keyToCode(key) : undefined);
    engine.handleKey(key, resolvedCode);
    const hk = engine.getHighlightKey();
    KeyboardView.highlight(hk !== null ? hk : key);
  };

  // Physical keyboard events (desktop).
  document.addEventListener("keydown", function (e) {
    if (!engine || playArea.hidden) return;
    if (e.repeat) { e.preventDefault(); return; } // ignore auto-repeat

    // Let browser-level shortcuts (refresh / devtools) pass through.
    if ((e.metaKey || e.ctrlKey) && /^[rR]$/.test(e.key)) return;

    if (engine.mode === "type") {
      if (e.key === "Tab") { e.preventDefault(); return; }
      if (e.key.length === 1 || e.key === "Backspace") e.preventDefault();
    } else {
      e.preventDefault(); // stop arrows/space from scrolling or navigating
    }

    KeyboardView.highlight(e.key);
    engine.handleKey(e.key, e.code);
    const hk = engine.getHighlightKey();
    KeyboardView.highlight(hk !== null ? hk : e.key);
  });
  document.addEventListener("keyup", function () {
    if (engine && engine.mode === "type") KeyboardView.highlight(null);
  });

  function renderLessons(list) {
    lessonList.innerHTML = "";
    list.forEach(function (ls, i) {
      const b = document.createElement("button");
      b.className = "lesson-chip" + (i === 0 ? " active" : "");
      const stat = summary[ls.id];
      const best = stat ? ' <span class="chip-best">★' + Math.round(stat.best_wpm) + "</span>" : "";
      b.innerHTML = esc(ls.title) + best;
      b.title = ls.description + (stat ? "（最佳速度 " + Math.round(stat.best_wpm) + " 词/分）" : "");
      b.addEventListener("click", function () { startLesson(ls, b); });
      lessonList.appendChild(b);
    });
  }

  // 粗略判断是否为触摸设备（平板/手机）：这类设备没有物理键盘，也不存在输入法抢键问题。
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  function startLesson(ls, btn) {
    currentLesson = ls;
    document.querySelectorAll(".lesson-chip").forEach(function (c) { c.classList.remove("active"); });
    if (btn) btn.classList.add("active");
    playArea.hidden = false;
    if (ls.kind === "keys") {
      hint.textContent = "看下方高亮的键，在电脑上按出来，或在平板上点它。";
    } else if (isTouch) {
      hint.textContent = "用手指点下面的按键，一个一个按出来～";
    } else {
      hint.textContent =
        "在电脑上直接敲键盘。注意：请先把输入法切到英文（中文输入法会把 ; 等符号键变成全角，导致按不对）。";
    }
    if (!engine) engine = new TypingEngine(textDisplay, { onUpdate: updateStats, onFinish: onFinish });
    engine.reset(ls);
    updateStats(engine.stats());
    KeyboardView.highlight(engine.getHighlightKey());
    textDisplay.focus();
  }

  function updateStats(s) {
    statTime.textContent = s.time + "s";
    statWpm.textContent = s.mode === "keys" ? "-" : s.wpm;
    statAcc.textContent = s.accuracy + "%";
    statProg.textContent = s.progress + "%";
  }

  function onFinish(s) {
    let html =
      (s.mode === "type"
        ? '<div><b>' + s.wpm + "</b><span>速度 (词/分)</span></div>"
        : '<div><b>' + s.correct + "</b><span>完成按键</span></div>") +
      '<div><b>' + s.accuracy + "%</b><span>正确率</span></div>" +
      '<div><b>' + s.time + "s</b><span>用时</span></div>" +
      '<div><b>' + s.errors + "</b><span>按错次数</span></div>";
    resultStats.innerHTML = html;
    resultModal.hidden = false;

    // Report progress (persisted to SQLite, queryable across sessions/devices).
    // 仅把身份随机串 profile_id 发给接口；名称只在本地，不对外发送。
    fetch("/api/v1/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_id: currentLesson.id,
        profile_id: currentProfile,
        wpm: s.wpm,
        accuracy: s.accuracy,
        duration: s.time,
        errors: s.errors
      })
    })
      .then(function () { return loadProgress(function () {}); })
      .then(function () { renderLessons(lessons); })
      .catch(function () {});
  }

  document.getElementById("btnRestart").addEventListener("click", function () {
    if (currentLesson) startLesson(currentLesson, null);
  });
  document.getElementById("btnAgain").addEventListener("click", function () {
    resultModal.hidden = true;
  });

  // —— 启动流程 ——
  loadProfiles();
  renderProfileBar();
  wireProfileEvents();
  KeyboardView.render(keyboardEl);

  // Load lessons, then the progress summary (按当前身份) to show the "best" badge.
  fetch("/api/v1/lessons")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      lessons = (d && d.Data && d.Data.Items) || [];
      if (!lessons.length) { hint.textContent = "没有可用的练习关卡。"; return; }
      loadProgress(function () {
        renderLessons(lessons);
        startLesson(lessons[0], lessonList.firstElementChild);
      });
    })
    .catch(function () {
      hint.textContent = "无法加载关卡，请确认服务已启动 (go run)。";
    });

  // Register the Service Worker for PWA (iPad "Add to Home Screen" -> fullscreen/offline).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
