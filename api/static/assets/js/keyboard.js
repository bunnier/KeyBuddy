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

  function render(container) {
    container.innerHTML = "";
    KEY_ROWS.forEach(function (row) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
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
        el.addEventListener("click", function () {
          global.dispatchTypingKey(k === "Space" ? " " : k);
        });
        rowEl.appendChild(el);
      });
      container.appendChild(rowEl);
    });
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
