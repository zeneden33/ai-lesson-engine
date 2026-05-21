(function () {
'use strict';
var B = ExerciseBase;
var TYPE = 'fillBlanks';

function render(data) {
  if (!data) return '';
  return B.exBox(++window.__exNum || 1, 'Fill in the Blanks', '填空', data.map(function (f) {
    return '<div class="fill-sentence">' +
      f.sentence.replace('___', '<input class="fill-input" data-answer="' + B.esc(f.answer) + '" style="min-width:130px">') +
      '</div>';
  }).join('') + '<button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button>');
}

function checkFill(btn) {
  var ex = btn.closest('.exercise');
  var inputs = ex.querySelectorAll('.fill-input[data-answer]');
  var fb = ex.querySelector('.feedback');
  if (!fb) {
    fb = document.createElement('div');
    fb.className = 'feedback';
    ex.appendChild(fb);
  }
  var all = true;
  var firstWrong = null;
  inputs.forEach(function (i) {
    var got = i.value.trim();
    var exp = i.dataset.answer.trim();
    var strip = function(s) { return s.replace(/[\u064B-\u0652\u0670]/g, '').trim().toLowerCase(); };
    if (strip(got) === strip(exp)) { i.classList.add('correct'); i.classList.remove('wrong'); }
    else { i.classList.add('wrong'); i.classList.remove('correct'); all = false; if (!firstWrong) firstWrong = i; }
  });
  if (all) {
    Exercises.correct++;
    fb.className = 'feedback show success';
    fb.innerHTML = '✅ Great!';
  } else {
    Exercises.wrong++;
    fb.className = 'feedback show error';
    fb.innerHTML = '❌ Try Again!';
    if (firstWrong) setTimeout(function() { firstWrong.focus(); }, 300);
  }
}

ExerciseRegistry.register({ TYPE: TYPE, LABEL: 'Fill in the Blanks', ORDER: 3, render: render });
Exercises.checkFill = checkFill;
})();
