// keyboard.js —— 可视化虚拟键盘组件。
// 负责渲染标准键盘布局（含功能键区），并在真实按键或屏幕点按时高亮对应键。
// 平板没有物理键盘，孩子直接点屏幕上的键即可输入（契合"平板认知"场景）；
// 桌面端则把真实按键高亮出来，帮助孩子建立"键在哪"的空间记忆（契合"桌面实操"）。
(function (global) {
  // 键盘布局。"" 表示占位空格（不渲染可点按键）；其余为按键 token。
  // 注意：token 必须与真实键盘的 event.key 完全一致（如修饰键是 "Control" 而非 "Ctrl"、
  // 大写锁定是 "CapsLock"），否则桌面端真实按键与平板点按无法匹配/高亮。
  const KEY_ROWS = [
    // 功能键区：Esc + F1~F12（分组留白）
    ["Escape", "", "F1", "F2", "F3", "F4", "", "F5", "F6", "F7", "F8", "", "F9", "F10", "F11", "F12"],
    // 主键盘区
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
    ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
    ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
    ["Control", "Meta", "Alt", "Space", "Alt", "Meta", "Control"],
    // 编辑/导航区
    ["Insert", "Home", "PageUp", "Delete", "End", "PageDown"],
    ["", "ArrowUp", ""],
    ["ArrowLeft", "ArrowDown", "ArrowRight"]
  ];

  // 特殊键的显示标签（其余直接用 token 本身，如 F1 / ArrowUp）。
  const LABELS = {
    Backspace: "⌫", Enter: "⏎", Tab: "Tab", CapsLock: "Caps",
    Shift: "⇧", Control: "Ctrl", Meta: "⌘", Alt: "Alt", Space: "空格",
    Escape: "Esc", Delete: "Del", Insert: "Ins", Home: "Home",
    End: "End", PageUp: "PgUp", PageDown: "PgDn",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→"
  };

  // 较宽的键（占更多空间）。
  const WIDE = ["Escape", "Backspace", "Enter", "Tab", "CapsLock", "Shift",
    "Control", "Meta", "Alt", "Delete", "Insert", "Home", "End", "PageUp", "PageDown"];

  // 手指分工映射：token -> 手指代码。
  // lp/li/lm/lr = 左手小指/食指/中指/无名指；rp/ri/rm/rr = 右手对应；thumb = 拇指。
  const FINGER = {
    Escape: "lp",
    "`": "lp", "1": "lp", "2": "lr", "3": "lm", "4": "li", "5": "li",
    "6": "ri", "7": "ri", "8": "rm", "9": "rr", "0": "rp",
    "-": "rp", "=": "rp", Backspace: "rp",
    Tab: "lp", Q: "lp", W: "lr", E: "lm", R: "li", T: "li",
    Y: "ri", U: "ri", I: "rm", O: "rr", P: "rp",
    "[": "rp", "]": "rp", "\\": "rp",
    CapsLock: "lp", A: "lp", S: "lr", D: "lm", F: "li", G: "li",
    H: "ri", J: "ri", K: "rm", L: "rr", ";": "rp", "'": "rp", Enter: "rp",
    Shift: "lp", Z: "lp", X: "lr", C: "lm", V: "li", B: "li",
    N: "ri", M: "ri", ",": "rm", ".": "rr", "/": "rp", // 右侧 Shift 也映射为 rp
    Control: "lp", Meta: "lp", Alt: "lp", Space: "thumb"
  };
  // 注意：同一 token 在左右两边都出现时（Shift/Control/Meta/Alt），
  // 键盘行内从左到右依次是左手、右手。render 里按出现顺序特殊处理。

  const FINGER_NAMES = {
    lp: "小指（左手）", lr: "无名指（左手）", lm: "中指（左手）", li: "食指（左手）",
    rp: "小指（右手）", rr: "无名指（右手）", rm: "中指（右手）", ri: "食指（右手）",
    thumb: "拇指（左右手）"
  };

  function render(container) {
    container.innerHTML = "";

    // 顶部指引：右手四指
    const topGuide = document.createElement("div");
    topGuide.className = "kb-guide kb-guide-top";
    ["ri", "rm", "rr", "rp"].forEach(function (f) {
      const s = document.createElement("span");
      s.className = "fg-name fg-" + f;
      s.textContent = FINGER_NAMES[f];
      topGuide.appendChild(s);
    });
    container.appendChild(topGuide);

    KEY_ROWS.forEach(function (row) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      const seenPairs = {}; // 用于同一 token 左右手重复出现时的手动映射
      row.forEach(function (k) {
        if (k === "") {
          const sp = document.createElement("div");
          sp.className = "kb-spacer";
          rowEl.appendChild(sp);
          return;
        }
        const el = document.createElement("div");
        el.className = "key";
        const dataKey = k === "Space" ? " " : k.toLowerCase();
        el.dataset.key = dataKey;
        el.textContent = LABELS[k] !== undefined ? LABELS[k] : k;
        if (WIDE.indexOf(k) !== -1) el.classList.add("key-wide");
        if (k === "Space") el.classList.add("key-space");
        if (k.indexOf("F") === 0 && k.length <= 3) el.classList.add("key-fn"); // F1~F12

        // 手指颜色：重复键（Shift/Control/Meta/Alt）按出现顺序分别给左手、右手。
        let finger = FINGER[k];
        if (["Shift", "Control", "Meta", "Alt"].indexOf(k) !== -1) {
          seenPairs[k] = (seenPairs[k] || 0) + 1;
          finger = seenPairs[k] === 1 ? "lp" : "rp";
        }
        if (finger) {
          el.dataset.finger = finger;
          el.classList.add("finger-" + finger);
        }

        el.addEventListener("click", function () {
          global.dispatchTypingKey(k === "Space" ? " " : k);
        });
        rowEl.appendChild(el);
      });
      container.appendChild(rowEl);
    });

    // 底部指引：左手四指 + 拇指
    const bottomGuide = document.createElement("div");
    bottomGuide.className = "kb-guide kb-guide-bottom";
    ["lp", "lr", "lm", "li", "thumb"].forEach(function (f) {
      const s = document.createElement("span");
      s.className = "fg-name fg-" + f;
      s.textContent = FINGER_NAMES[f];
      bottomGuide.appendChild(s);
    });
    container.appendChild(bottomGuide);
  }

  // highlight 高亮给定键；传入数组可同时高亮多个（组合键）；传 null/空清除高亮。
  function highlight(keys) {
    document.querySelectorAll(".key.active").forEach(function (e) {
      e.classList.remove("active");
    });
    if (!keys) return;
    const arr = Array.isArray(keys) ? keys : [keys];
    arr.forEach(function (k) {
      const dk = (k === " " || k === null) ? " " : String(k).toLowerCase();
      const el = document.querySelector('.key[data-key="' + dk + '"]');
      if (el) el.classList.add("active");
    });
  }

  global.KeyboardView = { render: render, highlight: highlight };
})(window);
