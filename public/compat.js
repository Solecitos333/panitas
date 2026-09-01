// Compatibilidad mínima para el WebView de Android 8.1 incluido en algunas
// terminales ELO. Debe ejecutarse antes de los módulos de Firebase.
(function installLegacyWebViewCompatibility(scope) {
  if (!scope) return;
  if (typeof scope.globalThis === 'undefined') scope.globalThis = scope;

  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function fromEntries(entries) {
      var result = {};
      var iterator = entries[Symbol.iterator]();
      var next = iterator.next();
      while (!next.done) {
        var entry = next.value;
        if (entry && entry.length >= 2) result[entry[0]] = entry[1];
        next = iterator.next();
      }
      return result;
    };
  }

  if (typeof Promise.prototype.finally !== 'function') {
    Promise.prototype.finally = function promiseFinally(callback) {
      var Constructor = this.constructor || Promise;
      return this.then(
        function onFulfilled(value) {
          return Constructor.resolve(callback()).then(function returnValue() { return value; });
        },
        function onRejected(reason) {
          return Constructor.resolve(callback()).then(function rethrow() { throw reason; });
        }
      );
    };
  }
})(typeof self !== 'undefined' ? self : this);
