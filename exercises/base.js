(function () {
'use strict';
window.ExerciseBase = {
  esc: function esc(s) {
    if (typeof s !== 'string') return s;
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },
  guard: function guard(val, fallback) {
    return val !== null && val !== undefined ? val : fallback;
  },
  guardArr: function guardArr(val) {
    return Array.isArray(val) ? val : [];
  },
  exBox: function exBox(num, title, inst, content) {
    return '<div class="exercise"><div class="ex-header"><div class="ex-num">' + num + '</div><div><div class="ex-title">' + this.esc(title) + '</div><div class="ex-instruction">' + this.esc(inst) + '</div></div></div>' + content + '<div class="feedback"></div></div>';
  }
};
})();
