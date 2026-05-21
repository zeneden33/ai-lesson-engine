(function () {
'use strict';
var _registry = [];
window.ExerciseRegistry = {
  register: function register(mod) {
    _registry.push(mod);
    _registry.sort(function (a, b) { return a.ORDER - b.ORDER; });
  },
  getAll: function getAll() {
    return _registry;
  },
  get: function get(type) {
    for (var i = 0; i < _registry.length; i++) {
      if (_registry[i].TYPE === type) return _registry[i];
    }
    return null;
  }
};
})();
