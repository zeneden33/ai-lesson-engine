(function () {
'use strict';
var B = ExerciseBase;
var TYPE = 'trueFalse';

function render(data) {
  if (!data) return '';
  return B.exBox(++window.__exNum || 1, 'True / False', '判断对错', data.map(function (t, i) {
    return '<div class="tf-item" data-idx="' + i + '">' +
      '<div class="tf-statement en-text">' + B.esc(t.en) + '</div>' +
      '<div class="tf-btns">' +
      '<button class="tf-btn" onclick="Exercises.tf(this,' + t.correct + ')">✅ True</button>' +
      '<button class="tf-btn" onclick="Exercises.tf(this,' + (!t.correct) + ')">❌ False</button>' +
      '</div></div>';
  }).join(''));
}

function tf(btn, correct) {
  var p = btn.closest('.tf-item');
  if (p.dataset.done) return;
  p.dataset.done = '1';
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (correct) Exercises.correct++;
  else Exercises.wrong++;
  var fb = btn.closest('.exercise').querySelector('.feedback');
  if (fb) { fb.className = 'feedback show ' + (correct ? 'success' : 'error'); fb.innerHTML = correct ? '✅ Great!' : '❌ Try Again!'; }
}

ExerciseRegistry.register({ TYPE: TYPE, LABEL: 'True / False', ORDER: 2, render: render });
Exercises.tf = tf;
})();
