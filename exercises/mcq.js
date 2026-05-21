(function () {
'use strict';
var B = ExerciseBase;
var TYPE = 'mcq';

function render(data) {
  if (!data) return '';
  var num = 0;
  return data.map(function (q, i) {
    num = ++window.__exNum || (i + 1);
    return B.exBox(num, 'Multiple Choice', '选择题',
      '<div style="font-size:20px;margin-bottom:12px">' + B.esc(q.question) + '</div>' +
      '<div class="mcq-options">' + q.options.map(function (o, j) {
        return '<button class="mcq-opt" onclick="Exercises.mcq(this,' + (j === q.correct) + ')" data-idx="' + j + '">' +
          '<span class="mcq-letter">' + 'ABCD'[j] + '</span><span class="en-text">' + B.esc(o) + '</span></button>';
      }).join('') + '</div>');
  }).join('');
}

function mcq(el, correct) {
  if (el.dataset.answered) return;
  el.dataset.answered = '1';
  el.classList.add(correct ? 'correct' : 'wrong');
  if (correct) {
    Exercises.correct++;
    var fb = el.closest('.exercise').querySelector('.feedback');
    if (fb) { fb.className = 'feedback show success'; fb.innerHTML = '✅ Great!'; }
    setTimeout(function() { delete el.dataset.answered; }, 2000);
  } else {
    Exercises.wrong++;
    var self = el;
    setTimeout(function() {
      self.classList.remove('wrong');
      delete self.dataset.answered;
    }, 1500);
  }
}

ExerciseRegistry.register({ TYPE: TYPE, LABEL: 'Multiple Choice', ORDER: 1, render: render });
Exercises.mcq = mcq;
})();
