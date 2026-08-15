// app.js - page bootstrap: load lessons, wire the typing engine, virtual keyboard
// and stats, and report progress to the backend on finish.
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

  let engine = null;
  let lessons = [];
  let currentLesson = null;
  let summary = {}; // { lesson_id: {attempts, best_wpm, avg_accuracy} }

  // Unified input entry, shared by the physical keyboard and on-screen taps.
  window.dispatchTypingKey = function (key, code) {
    if (!engine || playArea.hidden) return;
    engine.handleKey(key, code);
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
    fetch("/api/v1/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_id: currentLesson.id,
        wpm: s.wpm,
        accuracy: s.accuracy,
        duration: s.time,
        errors: s.errors
      })
    })
      .then(function () { return fetch("/api/v1/progress"); })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        summary = (d && d.Data && d.Data.by_lesson) || {};
        renderLessons(lessons);
      })
      .catch(function () {});
  }

  document.getElementById("btnRestart").addEventListener("click", function () {
    if (currentLesson) startLesson(currentLesson, null);
  });
  document.getElementById("btnAgain").addEventListener("click", function () {
    resultModal.hidden = true;
  });

  KeyboardView.render(keyboardEl);

  // Load lessons, then the progress summary to show the "best" badge.
  fetch("/api/v1/lessons")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      lessons = (d && d.Data && d.Data.Items) || [];
      if (!lessons.length) { hint.textContent = "没有可用的练习关卡。"; return; }
      return fetch("/api/v1/progress")
        .then(function (r) { return r.json(); })
        .then(function (pd) {
          summary = (pd && pd.Data && pd.Data.by_lesson) || {};
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
