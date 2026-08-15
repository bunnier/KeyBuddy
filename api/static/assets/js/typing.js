// typing.js —— 核心打字引擎。
// 支持两种关卡：
//   - type：逐字符输入（字母/数字/单词/句子），逐字高亮 + 速度/正确率统计；
//   - keys：功能键认知，每一步是单键或组合键（如 Ctrl+C），比对 event.key/event.code，
//           并在虚拟键盘上高亮"下一个要按的键"，帮孩子在桌面端建立功能键的空间记忆。
//
// 关键：type 模式按物理键 event.code 比对，而不是 event.key。
// 原因：中文输入法会把 ; 这类符号键的 event.key 改写成全角 ；或 "Process"，
// 导致比对失败（字母 a-z 却会透传，所以只有符号键穿帮）。event.code 是物理键位，
// 输入法和键盘布局都改不了它，; 永远是 "Semicolon"。这也是 keybr/monkeytype 的做法。
(function (global) {
  // CHAR_TO_CODE：练习文本里可能出现的字符 → 它的物理键位 code。
  // 字母 a-z、数字 0-9 按规律生成；标点符号用静态表。未覆盖的字符回退到 event.key 比对。
  const PUNCT_CODE = {
    " ": "Space",
    ";": "Semicolon",
    "'": "Quote",
    ",": "Comma",
    ".": "Period",
    "/": "Slash",
    "\\": "Backslash",
    "[": "BracketLeft",
    "]": "BracketRight",
    "-": "Minus",
    "=": "Equal",
    "`": "Backquote"
  };
  function charToCode(ch) {
    if (!ch) return null;
    const lower = ch.toLowerCase();
    if (lower >= "a" && lower <= "z") return "Key" + lower.toUpperCase();
    if (lower >= "0" && lower <= "9") return "Digit" + lower;
    return PUNCT_CODE[ch] || PUNCT_CODE[lower] || null;
  }

  // 纯修饰键不产生字符，按下时不应计入对错（Shift/Ctrl/Alt/Meta/CapsLock）。
  const MODIFIER_CODES = {
    ShiftLeft: 1, ShiftRight: 1, ControlLeft: 1, ControlRight: 1,
    AltLeft: 1, AltRight: 1, MetaLeft: 1, MetaRight: 1, CapsLock: 1
  };

  class TypingEngine {
    constructor(displayEl, opts) {
      this.display = displayEl;
      this.onUpdate = (opts && opts.onUpdate) || function () {};
      this.onFinish = (opts && opts.onFinish) || function () {};
      this.reset({ kind: "type", text: "" });
    }

    // reset 载入一个关卡（{kind, text?, steps?}）。
    reset(lesson) {
      this.mode = (lesson && lesson.kind) === "keys" ? "keys" : "type";
      this.text = (lesson && lesson.text) || "";
      this.steps = (lesson && lesson.steps) || [];
      this.index = 0;
      this.partIndex = 0;
      this.correct = 0;
      this.errors = 0;
      this.startTime = null;
      this.endTime = null;
      this.finished = false;
      this.render();
    }

    render() {
      this.display.innerHTML = "";
      this.display.classList.toggle("keys-mode", this.mode === "keys");

      if (this.mode === "keys") {
        this.cards = [];
        this.steps.forEach((step) => {
          const card = document.createElement("div");
          card.className = "key-card";
          const parts = (step.combo && step.combo.length)
            ? step.combo.map((p) => p.display)
            : [step.display];
          card.innerHTML = parts
            .map((d) => '<span class="kc-cap">' + esc(d) + "</span>")
            .join('<span class="kc-plus">+</span>');
          this.display.appendChild(card);
          this.cards.push(card);
        });
      } else {
        this.spans = [];
        for (let i = 0; i < this.text.length; i++) {
          const s = document.createElement("span");
          s.className = "char";
          s.textContent = this.text[i];
          this.display.appendChild(s);
          this.spans.push(s);
        }
      }
      this.updateCurrent();
    }

    updateCurrent() {
      if (this.mode === "keys") {
        this.cards.forEach((c, i) => {
          c.classList.toggle("current", i === this.index && !this.finished);
          c.classList.toggle("done", i < this.index);
        });
        if (!this.finished && this.cards[this.index]) {
          const caps = this.cards[this.index].querySelectorAll(".kc-cap");
          caps.forEach((cap, j) =>
            cap.classList.toggle("active", j === this.partIndex)
          );
        }
      } else {
        this.spans.forEach((s, i) => {
          s.classList.toggle("current", i === this.index && !this.finished);
        });
      }
    }

    // handleKey 处理一次按键。key 为 event.key，code 为 event.code（可选）。
    handleKey(key, code) {
      if (this.finished) return;
      if (this.startTime === null) this.startTime = Date.now();
      if (this.mode === "type") this.handleType(key, code);
      else this.handleKeys(key, code);
    }

    handleType(key, code) {
      if (key === "Backspace" || code === "Backspace") {
        if (this.index > 0) {
          this.index--;
          const s = this.spans[this.index];
          s.classList.remove("correct", "wrong");
        }
        this.updateCurrent();
        this.emit();
        return;
      }
      if (this.index >= this.text.length) return;

      const target = this.text[this.index];
      const s = this.spans[this.index];
      const expectedCode = charToCode(target);

      // 按物理键位 code 比对（抗中文输入法改写 event.key / 发送 "Process"）。
      //   - 命中：正确；
      //   - 未命中且按的是纯修饰键：忽略，不算错；
      //   - 未命中其它键：记一次错。
      // 若该字符没有 code 映射（罕见），回退到 event.key 比对，避免误伤。
      let matched = false;
      if (expectedCode) {
        if (code === expectedCode) {
          matched = true;
        } else if (MODIFIER_CODES[code]) {
          return; // 修饰键：忽略
        }
      } else if (key && key.length === 1) {
        matched = key.toLowerCase() === target.toLowerCase();
      }
      if (matched) {
        s.classList.add("correct");
        s.classList.remove("wrong");
        this.correct++;
      } else {
        s.classList.add("wrong");
        this.errors++;
      }
      this.index++;
      if (this.index >= this.text.length) this.finish();
      this.updateCurrent();
      this.emit();
      if (this.finished) this.onFinish(this.stats());
    }

    handleKeys(key, code) {
      const step = this.steps[this.index];
      if (!step) return;
      const expected = (step.combo && step.combo.length)
        ? step.combo[this.partIndex]
        : { match: step.match, code: step.code };

      // match 不区分大小写：物理按键 "c" 与平板点按派发的 "C" 都能命中。
      const matched =
        (expected.match && key.toLowerCase() === expected.match.toLowerCase()) ||
        (expected.code && code === expected.code);

      if (matched) {
        if (step.combo && step.combo.length) {
          this.partIndex++;
          if (this.partIndex >= step.combo.length) {
            this.index++;
            this.partIndex = 0;
            this.correct++;
          }
        } else {
          this.index++;
          this.correct++;
        }
        if (this.index >= this.steps.length) this.finish();
      } else {
        this.errors++;
      }
      this.updateCurrent();
      this.emit();
      if (this.finished) this.onFinish(this.stats());
    }

    // getHighlightKey 返回当前应当高亮的键（供虚拟键盘高亮"下一步要按的键"）。
    // type 模式返回 null（由调用方高亮刚按下的物理键）。
    getHighlightKey() {
      if (this.mode === "type" || this.finished) return null;
      const step = this.steps[this.index];
      if (!step) return null;
      const expected = (step.combo && step.combo.length)
        ? step.combo[this.partIndex]
        : { match: step.match, code: step.code };
      return expected ? expected.match || expected.code : null;
    }

    finish() {
      this.finished = true;
      this.endTime = Date.now();
    }

    stats() {
      const elapsed = this.startTime ? (this.endTime || Date.now()) - this.startTime : 0;
      const minutes = elapsed / 60000;
      const wpm = this.mode === "type" && minutes > 0
        ? Math.round((this.correct / 5) / minutes)
        : 0;
      const total = this.correct + this.errors;
      const accuracy = total > 0 ? Math.round((this.correct / total) * 100) : 100;
      const denom = this.mode === "type" ? this.text.length : this.steps.length;
      const progress = denom ? Math.round((this.index / denom) * 100) : 0;
      return {
        time: Math.round(elapsed / 1000),
        wpm: wpm,
        accuracy: accuracy,
        progress: progress,
        correct: this.correct,
        errors: this.errors,
        mode: this.mode
      };
    }

    emit() {
      this.onUpdate(this.stats());
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  global.TypingEngine = TypingEngine;
})(window);
