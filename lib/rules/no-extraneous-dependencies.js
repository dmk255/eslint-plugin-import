'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _readPkgUp = require('read-pkg-up');

var _readPkgUp2 = _interopRequireDefault(_readPkgUp);

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

var _resolve = require('eslint-module-utils/resolve');

var _resolve2 = _interopRequireDefault(_resolve);

var _importType = require('../core/importType');

var _importType2 = _interopRequireDefault(_importType);

var _staticRequire = require('../core/staticRequire');

var _staticRequire2 = _interopRequireDefault(_staticRequire);

var _docsUrl = require('../docsUrl');

var _docsUrl2 = _interopRequireDefault(_docsUrl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const CWD = process.cwd();

function hasKeys() {
  let obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

  return Object.keys(obj).length > 0;
}

function extractDepFields(pkg) {
  return {
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    optionalDependencies: pkg.optionalDependencies || {},
    peerDependencies: pkg.peerDependencies || {}
  };
}

function assignDeps(fromDeps, toDeps) {
  Object.assign(fromDeps.dependencies, toDeps.dependencies);
  Object.assign(fromDeps.devDependencies, toDeps.devDependencies);
  Object.assign(fromDeps.peerDependencies, toDeps.peerDependencies);
  Object.assign(fromDeps.optionalDependencies, toDeps.optionalDependencies);
}

function getDependencies(context, packageDir, filename) {
  const files = [];

  try {
    const closest = _readPkgUp2.default.sync({ cwd: filename, normalize: false });
    files.push(closest.path);

    const deps = (packageDir ? [].concat(packageDir) : []).reduce((allDeps, dir) => {
      const pkgFile = _path2.default.resolve(dir, 'package.json');

      if (files.indexOf(pkgFile) === -1) {
        files.push(pkgFile);

        assignDeps(allDeps, extractDepFields(JSON.parse(_fs2.default.readFileSync(pkgFile, 'utf8'))));
      }

      return allDeps;
    }, extractDepFields(closest.pkg));

    if ([deps.dependencies, deps.devDependencies, deps.optionalDependencies, deps.peerDependencies].some(hasKeys)) {
      return deps;
    }
  } catch (e) {
    const relFiles = files.map(file => _path2.default.relative(CWD, file));

    if (e.code === 'ENOENT') {
      context.report({
        message: `Could not find: ${relFiles.join(', ')}`,
        loc: { line: 0, column: 0 }
      });
    } else if (e.name === 'JSONError' || e instanceof SyntaxError) {
      context.report({
        message: `Could not parse ${relFiles[relFiles.length - 1]}: ${e.message}`,
        loc: { line: 0, column: 0 }
      });
    } else {
      context.report({
        message: `Unknown Error while searching; ${relFiles.join(', ')}: ${e.message}`,
        loc: { line: 0, column: 0 }
      });
    }
  }
}

function missingErrorMessage(packageName) {
  return `'${packageName}' should be listed in the project's dependencies. ` + `Run 'npm i -S ${packageName}' to add it`;
}

function devDepErrorMessage(packageName) {
  return `'${packageName}' should be listed in the project's dependencies, not devDependencies.`;
}

function optDepErrorMessage(packageName) {
  return `'${packageName}' should be listed in the project's dependencies, ` + `not optionalDependencies.`;
}

function reportIfMissing(context, deps, depsOptions, node, name) {
  // Do not report when importing types
  if (node.importKind === 'type') {
    return;
  }

  if ((0, _importType2.default)(name, context) !== 'external') {
    return;
  }

  const resolved = (0, _resolve2.default)(name, context);
  if (!resolved) {
    return;
  }

  const splitName = name.split('/');
  const packageName = splitName[0][0] === '@' ? splitName.slice(0, 2).join('/') : splitName[0];
  const isInDeps = deps.dependencies[packageName] !== undefined;
  const isInDevDeps = deps.devDependencies[packageName] !== undefined;
  const isInOptDeps = deps.optionalDependencies[packageName] !== undefined;
  const isInPeerDeps = deps.peerDependencies[packageName] !== undefined;

  if (isInDeps || depsOptions.allowDevDeps && isInDevDeps || depsOptions.allowPeerDeps && isInPeerDeps || depsOptions.allowOptDeps && isInOptDeps) {
    return;
  }

  if (isInDevDeps && !depsOptions.allowDevDeps) {
    context.report(node, devDepErrorMessage(packageName));
    return;
  }

  if (isInOptDeps && !depsOptions.allowOptDeps) {
    context.report(node, optDepErrorMessage(packageName));
    return;
  }

  context.report(node, missingErrorMessage(packageName));
}

function testConfig(config, filename) {
  // Simplest configuration first, either a boolean or nothing.
  if (typeof config === 'boolean' || typeof config === 'undefined') {
    return config;
  }
  // Array of globs.
  return config.some(c => (0, _minimatch2.default)(filename, c) || (0, _minimatch2.default)(filename, _path2.default.join(process.cwd(), c)));
}

module.exports = {
  meta: {
    docs: {
      url: (0, _docsUrl2.default)('no-extraneous-dependencies')
    },

    schema: [{
      'type': 'object',
      'properties': {
        'devDependencies': { 'type': ['boolean', 'array'] },
        'optionalDependencies': { 'type': ['boolean', 'array'] },
        'peerDependencies': { 'type': ['boolean', 'array'] },
        'packageDir': { 'type': ['string', 'array'] }
      },
      'additionalProperties': false
    }]
  },

  create(context) {
    var _context$options = _slicedToArray(context.options, 1),
        _context$options$ = _context$options[0];

    _context$options$ = _context$options$ === undefined ? {} : _context$options$;
    const devDependencies = _context$options$.devDependencies,
          optionalDependencies = _context$options$.optionalDependencies,
          peerDependencies = _context$options$.peerDependencies,
          packageDir = _context$options$.packageDir;

    const filename = context.getFilename();
    const deps = getDependencies(context, packageDir, filename);

    if (!deps) {
      return {};
    }

    const depsOptions = {
      allowDevDeps: testConfig(devDependencies, filename) !== false,
      allowOptDeps: testConfig(optionalDependencies, filename) !== false,
      allowPeerDeps: testConfig(peerDependencies, filename) !== false

      // todo: use module visitor from module-utils core
    };return {
      ImportDeclaration: function (node) {
        reportIfMissing(context, deps, depsOptions, node, node.source.value);
      },
      CallExpression: function handleRequires(node) {
        if ((0, _staticRequire2.default)(node)) {
          reportIfMissing(context, deps, depsOptions, node, node.arguments[0].value);
        }
      }
    };
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInJ1bGVzL25vLWV4dHJhbmVvdXMtZGVwZW5kZW5jaWVzLmpzIl0sIm5hbWVzIjpbIkNXRCIsInByb2Nlc3MiLCJjd2QiLCJoYXNLZXlzIiwib2JqIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsImV4dHJhY3REZXBGaWVsZHMiLCJwa2ciLCJkZXBlbmRlbmNpZXMiLCJkZXZEZXBlbmRlbmNpZXMiLCJvcHRpb25hbERlcGVuZGVuY2llcyIsInBlZXJEZXBlbmRlbmNpZXMiLCJhc3NpZ25EZXBzIiwiZnJvbURlcHMiLCJ0b0RlcHMiLCJhc3NpZ24iLCJnZXREZXBlbmRlbmNpZXMiLCJjb250ZXh0IiwicGFja2FnZURpciIsImZpbGVuYW1lIiwiZmlsZXMiLCJjbG9zZXN0IiwicmVhZFBrZ1VwIiwic3luYyIsIm5vcm1hbGl6ZSIsInB1c2giLCJwYXRoIiwiZGVwcyIsImNvbmNhdCIsInJlZHVjZSIsImFsbERlcHMiLCJkaXIiLCJwa2dGaWxlIiwicmVzb2x2ZSIsImluZGV4T2YiLCJKU09OIiwicGFyc2UiLCJmcyIsInJlYWRGaWxlU3luYyIsInNvbWUiLCJlIiwicmVsRmlsZXMiLCJtYXAiLCJmaWxlIiwicmVsYXRpdmUiLCJjb2RlIiwicmVwb3J0IiwibWVzc2FnZSIsImpvaW4iLCJsb2MiLCJsaW5lIiwiY29sdW1uIiwibmFtZSIsIlN5bnRheEVycm9yIiwibWlzc2luZ0Vycm9yTWVzc2FnZSIsInBhY2thZ2VOYW1lIiwiZGV2RGVwRXJyb3JNZXNzYWdlIiwib3B0RGVwRXJyb3JNZXNzYWdlIiwicmVwb3J0SWZNaXNzaW5nIiwiZGVwc09wdGlvbnMiLCJub2RlIiwiaW1wb3J0S2luZCIsInJlc29sdmVkIiwic3BsaXROYW1lIiwic3BsaXQiLCJzbGljZSIsImlzSW5EZXBzIiwidW5kZWZpbmVkIiwiaXNJbkRldkRlcHMiLCJpc0luT3B0RGVwcyIsImlzSW5QZWVyRGVwcyIsImFsbG93RGV2RGVwcyIsImFsbG93UGVlckRlcHMiLCJhbGxvd09wdERlcHMiLCJ0ZXN0Q29uZmlnIiwiY29uZmlnIiwiYyIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwiZG9jcyIsInVybCIsInNjaGVtYSIsImNyZWF0ZSIsIm9wdGlvbnMiLCJnZXRGaWxlbmFtZSIsIkltcG9ydERlY2xhcmF0aW9uIiwic291cmNlIiwidmFsdWUiLCJDYWxsRXhwcmVzc2lvbiIsImhhbmRsZVJlcXVpcmVzIiwiYXJndW1lbnRzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsTUFBTUMsUUFBUUMsR0FBUixFQUFaOztBQUVBLFNBQVNDLE9BQVQsR0FBMkI7QUFBQSxNQUFWQyxHQUFVLHVFQUFKLEVBQUk7O0FBQ3pCLFNBQU9DLE9BQU9DLElBQVAsQ0FBWUYsR0FBWixFQUFpQkcsTUFBakIsR0FBMEIsQ0FBakM7QUFDRDs7QUFFRCxTQUFTQyxnQkFBVCxDQUEwQkMsR0FBMUIsRUFBK0I7QUFDN0IsU0FBTztBQUNMQyxrQkFBY0QsSUFBSUMsWUFBSixJQUFvQixFQUQ3QjtBQUVMQyxxQkFBaUJGLElBQUlFLGVBQUosSUFBdUIsRUFGbkM7QUFHTEMsMEJBQXNCSCxJQUFJRyxvQkFBSixJQUE0QixFQUg3QztBQUlMQyxzQkFBa0JKLElBQUlJLGdCQUFKLElBQXdCO0FBSnJDLEdBQVA7QUFNRDs7QUFFRCxTQUFTQyxVQUFULENBQW9CQyxRQUFwQixFQUE4QkMsTUFBOUIsRUFBc0M7QUFDcENYLFNBQU9ZLE1BQVAsQ0FBY0YsU0FBU0wsWUFBdkIsRUFBcUNNLE9BQU9OLFlBQTVDO0FBQ0FMLFNBQU9ZLE1BQVAsQ0FBY0YsU0FBU0osZUFBdkIsRUFBd0NLLE9BQU9MLGVBQS9DO0FBQ0FOLFNBQU9ZLE1BQVAsQ0FBY0YsU0FBU0YsZ0JBQXZCLEVBQXlDRyxPQUFPSCxnQkFBaEQ7QUFDQVIsU0FBT1ksTUFBUCxDQUFjRixTQUFTSCxvQkFBdkIsRUFBNkNJLE9BQU9KLG9CQUFwRDtB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b3J0IHBhdGggZnJvbSAncGF0aCdcbmltcG9ydCBmcyBmcm9tICdmcydcbmltcG9ydCByZWFkUGtnVXAgZnJvbSAncmVhZC1wa2ctdXAnXG5pbXBvcnQgbWluaW1hdGNoIGZyb20gJ21pbmltYXRjaCdcbmltcG9ydCByZXNvbHZlIGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvcmVzb2x2ZSdcbmltcG9ydCBpbXBvcnRUeXBlIGZyb20gJy4uL2NvcmUvaW1wb3J0VHlwZSdcbmltcG9ydCBpc1N0YXRpY1JlcXVpcmUgZnJvbSAnLi4vY29yZS9zdGF0aWNSZXF1aXJlJ1xuaW1wb3J0IGRvY3NVcmwgZnJvbSAnLi4vZG9jc1VybCdcblxuY29uc3QgQ1dEID0gcHJvY2Vzcy5jd2QoKVxuXG5mdW5jdGlvbiBoYXNLZXlzKG9iaiA9IHt9KSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDBcbn1cblxuZnVuY3Rpb24gZXh0cmFjdERlcEZpZWxkcyhwa2cpIHtcbiAgcmV0dXJuIHtcbiAgICBkZXBlbmRlbmNpZXM6IHBrZy5kZXBlbmRlbmNpZXMgfHwge30sXG4gICAgZGV2RGVwZW5kZW5jaWVzOiBwa2cuZGV2RGVwZW5kZW5jaWVzIHx8IHt9LFxuICAgIG9wdGlvbmFsRGVwZW5kZW5jaWVzOiBwa2cub3B0aW9uYWxEZXBlbmRlbmNpZXMgfHwge30sXG4gICAgcGVlckRlcGVuZGVuY2llczogcGtnLnBlZXJEZXBlbmRlbmNpZXMgfHwge30sXG4gIH1cbn1cblxuZnVuY3Rpb24gYXNzaWduRGVwcyhmcm9tRGVwcywgdG9EZXBzKSB7XG4gIE9iamVjdC5hc3NpZ24oZnJvbURlcHMuZGVwZW5kZW5jaWVzLCB0b0RlcHMuZGVwZW5kZW5jaWVzKVxuICBPYmplY3QuYXNzaWduKGZyb21EZXBzLmRldkRlcGVuZGVuY2llcywgdG9EZXBzLmRldkRlcGVuZGVuY2llcylcbiAgT2JqZWN0LmFzc2lnbihmcm9tRGVwcy5wZWVyRGVwZW5kZW5jaWVzLCB0b0RlcHMucGVlckRlcGVuZGVuY2llcylcbiAgT2JqZWN0LmFzc2lnbihmcm9tRGVwcy5vcHRpb25hbERlcGVuZGVuY2llcywgdG9EZXBzLm9wdGlvbmFsRGVwZW5kZW5jaWVzKVxufVxuXG5mdW5jdGlvbiBnZXREZXBlbmRlbmNpZXMoY29udGV4dCwgcGFja2FnZURpciwgZmlsZW5hbWUpIHtcbiAgY29uc3QgZmlsZXMgPSBbXVxuXG4gIHRyeSB7XG4gICAgY29uc3QgY2xvc2VzdCA9IHJlYWRQa2dVcC5zeW5jKHtjd2Q6IGZpbGVuYW1lLCBub3JtYWxpemU6IGZhbHNlfSlcbiAgICBmaWxlcy5wdXNoKGNsb3Nlc3QucGF0aClcblxuICAgIGNvbnN0IGRlcHMgPSAocGFja2FnZURpciA/IFtdLmNvbmNhdChwYWNrYWdlRGlyKSA6IFtdKVxuICAgICAgLnJlZHVjZSgoYWxsRGVwcywgZGlyKSA9PiB7XG4gICAgICAgIGNvbnN0IHBrZ0ZpbGUgPSBwYXRoLnJlc29sdmUoZGlyLCAncGFja2FnZS5qc29uJylcblxuICAgICAgICBpZiAoZmlsZXMuaW5kZXhPZihwa2dGaWxlKSA9PT0gLTEpIHtcbiAgICAgICAgICBmaWxlcy5wdXNoKHBrZ0ZpbGUpXG5cbiAgICAgICAgICBhc3NpZ25EZXBzKFxuICAgICAgICAgICAgYWxsRGVwcyxcbiAgICAgICAgICAgIGV4dHJhY3REZXBGaWVsZHMoSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMocGtnRmlsZSwgJ3V0ZjgnKSkpXG4gICAgICAgICAgKVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFsbERlcHNcbiAgICAgIH0sIGV4dHJhY3REZXBGaWVsZHMoY2xvc2VzdC5wa2cpKVxuXG4gICAgaWYgKFtcbiAgICAgIGRlcHMuZGVwZW5kZW5jaWVzLFxuICAgICAgZGVwcy5kZXZEZXBlbmRlbmNpZXMsXG4gICAgICBkZXBzLm9wdGlvbmFsRGVwZW5kZW5jaWVzLFxuICAgICAgZGVwcy5wZWVyRGVwZW5kZW5jaWVzLFxuICAgIF0uc29tZShoYXNLZXlzKSkge1xuICAgICAgcmV0dXJuIGRlcHNcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zdCByZWxGaWxlcyA9IGZpbGVzLm1hcCgoZmlsZSkgPT4gcGF0aC5yZWxhdGl2ZShDV0QsIGZpbGUpKVxuXG4gICAgaWYgKGUuY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kOiAke3JlbEZpbGVzLmpvaW4oJywgJyl9YCxcbiAgICAgICAgbG9jOiB7IGxpbmU6IDAsIGNvbHVtbjogMCB9LFxuICAgICAgfSlcbiAgICB9IGVsc2UgaWYgKGUubmFtZSA9PT0gJ0pTT05FcnJvcicgfHwgZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3QgcGFyc2UgJHtyZWxGaWxlc1tyZWxGaWxlcy5sZW5ndGggLSAxXX06ICR7ZS5tZXNzYWdlfWAsXG4gICAgICAgIGxvYzogeyBsaW5lOiAwLCBjb2x1bW46IDAgfSxcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgbWVzc2FnZTogYFVua25vd24gRXJyb3Igd2hpbGUgc2VhcmNoaW5nOyAke3JlbEZpbGVzLmpvaW4oJywgJyl9OiAke2UubWVzc2FnZX1gLFxuICAgICAgICBsb2M6IHsgbGluZTogMCwgY29sdW1uOiAwIH0sXG4gICAgICB9KVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBtaXNzaW5nRXJyb3JNZXNzYWdlKHBhY2thZ2VOYW1lKSB7XG4gIHJldHVybiBgJyR7cGFja2FnZU5hbWV9JyBzaG91bGQgYmUgbGlzdGVkIGluIHRoZSBwcm9qZWN0J3MgZGVwZW5kZW5jaWVzLiBgICtcbiAgICBgUnVuICducG0gaSAtUyAke3BhY2thZ2VOYW1lfScgdG8gYWRkIGl0YFxufVxuXG5mdW5jdGlvbiBkZXZEZXBFcnJvck1lc3NhZ2UocGFja2FnZU5hbWUpIHtcbiAgcmV0dXJuIGAnJHtwYWNrYWdlTmFtZX0nIHNob3VsZCBiZSBsaXN0ZWQgaW4gdGhlIHByb2plY3QncyBkZXBlbmRlbmNpZXMsIG5vdCBkZXZEZXBlbmRlbmNpZXMuYFxufVxuXG5mdW5jdGlvbiBvcHREZXBFcnJvck1lc3NhZ2UocGFja2FnZU5hbWUpIHtcbiAgcmV0dXJuIGAnJHtwYWNrYWdlTmFtZX0nIHNob3VsZCBiZSBsaXN0ZWQgaW4gdGhlIHByb2plY3QncyBkZXBlbmRlbmNpZXMsIGAgK1xuICAgIGBub3Qgb3B0aW9uYWxEZXBlbmRlbmNpZXMuYFxufVxuXG5mdW5jdGlvbiByZXBvcnRJZk1pc3NpbmcoY29udGV4dCwgZGVwcywgZGVwc09wdGlvbnMsIG5vZGUsIG5hbWUpIHtcbiAgLy8gRG8gbm90IHJlcG9ydCB3aGVuIGltcG9ydGluZyB0eXBlc1xuICBpZiAobm9kZS5pbXBvcnRLaW5kID09PSAndHlwZScpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChpbXBvcnRUeXBlKG5hbWUsIGNvbnRleHQpICE9PSAnZXh0ZXJuYWwnKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmUobmFtZSwgY29udGV4dClcbiAgaWYgKCFyZXNvbHZlZCkgeyByZXR1cm4gfVxuXG4gIGNvbnN0IHNwbGl0TmFtZSA9IG5hbWUuc3BsaXQoJy8nKVxuICBjb25zdCBwYWNrYWdlTmFtZSA9IHNwbGl0TmFtZVswXVswXSA9PT0gJ0AnXG4gICAgPyBzcGxpdE5hbWUuc2xpY2UoMCwgMikuam9pbignLycpXG4gICAgOiBzcGxpdE5hbWVbMF1cbiAgY29uc3QgaXNJbkRlcHMgPSBkZXBzLmRlcGVuZGVuY2llc1twYWNrYWdlTmFtZV0gIT09IHVuZGVmaW5lZFxuICBjb25zdCBpc0luRGV2RGVwcyA9IGRlcHMuZGV2RGVwZW5kZW5jaWVzW3BhY2thZ2VOYW1lXSAhPT0gdW5kZWZpbmVkXG4gIGNvbnN0IGlzSW5PcHREZXBzID0gZGVwcy5vcHRpb25hbERlcGVuZGVuY2llc1twYWNrYWdlTmFtZV0gIT09IHVuZGVmaW5lZFxuICBjb25zdCBpc0luUGVlckRlcHMgPSBkZXBzLnBlZXJEZXBlbmRlbmNpZXNbcGFja2FnZU5hbWVdICE9PSB1bmRlZmluZWRcblxuICBpZiAoaXNJbkRlcHMgfHxcbiAgICAoZGVwc09wdGlvbnMuYWxsb3dEZXZEZXBzICYmIGlzSW5EZXZEZXBzKSB8fFxuICAgIChkZXBzT3B0aW9ucy5hbGxvd1BlZXJEZXBzICYmIGlzSW5QZWVyRGVwcykgfHxcbiAgICAoZGVwc09wdGlvbnMuYWxsb3dPcHREZXBzICYmIGlzSW5PcHREZXBzKVxuICApIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChpc0luRGV2RGVwcyAmJiAhZGVwc09wdGlvbnMuYWxsb3dEZXZEZXBzKSB7XG4gICAgY29udGV4dC5yZXBvcnQobm9kZSwgZGV2RGVwRXJyb3JNZXNzYWdlKHBhY2thZ2VOYW1lKSlcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChpc0luT3B0RGVwcyAmJiAhZGVwc09wdGlvbnMuYWxsb3dPcHREZXBzKSB7XG4gICAgY29udGV4dC5yZXBvcnQobm9kZSwgb3B0RGVwRXJyb3JNZXNzYWdlKHBhY2thZ2VOYW1lKSlcbiAgICByZXR1cm5cbiAgfVxuXG4gIGNvbnRleHQucmVwb3J0KG5vZGUsIG1pc3NpbmdFcnJvck1lc3NhZ2UocGFja2FnZU5hbWUpKVxufVxuXG5mdW5jdGlvbiB0ZXN0Q29uZmlnKGNvbmZpZywgZmlsZW5hbWUpIHtcbiAgLy8gU2ltcGxlc3QgY29uZmlndXJhdGlvbiBmaXJzdCwgZWl0aGVyIGEgYm9vbGVhbiBvciBub3RoaW5nLlxuICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiBjb25maWcgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGNvbmZpZ1xuICB9XG4gIC8vIEFycmF5IG9mIGdsb2JzLlxuICByZXR1cm4gY29uZmlnLnNvbWUoYyA9PiAoXG4gICAgbWluaW1hdGNoKGZpbGVuYW1lLCBjKSB8fFxuICAgIG1pbmltYXRjaChmaWxlbmFtZSwgcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksIGMpKVxuICApKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbWV0YToge1xuICAgIGRvY3M6IHtcbiAgICAgIHVybDogZG9jc1VybCgnbm8tZXh0cmFuZW91cy1kZXBlbmRlbmNpZXMnKSxcbiAgICB9LFxuXG4gICAgc2NoZW1hOiBbXG4gICAgICB7XG4gICAgICAgICd0eXBlJzogJ29iamVjdCcsXG4gICAgICAgICdwcm9wZXJ0aWVzJzoge1xuICAgICAgICAgICdkZXZEZXBlbmRlbmNpZXMnOiB7ICd0eXBlJzogWydib29sZWFuJywgJ2FycmF5J10gfSxcbiAgICAgICAgICAnb3B0aW9uYWxEZXBlbmRlbmNpZXMnOiB7ICd0eXBlJzogWydib29sZWFuJywgJ2FycmF5J10gfSxcbiAgICAgICAgICAncGVlckRlcGVuZGVuY2llcyc6IHsgJ3R5cGUnOiBbJ2Jvb2xlYW4nLCAnYXJyYXknXSB9LFxuICAgICAgICAgICdwYWNrYWdlRGlyJzogeyAndHlwZSc6IFsnc3RyaW5nJywgJ2FycmF5J10gfSxcbiAgICAgICAgfSxcbiAgICAgICAgJ2FkZGl0aW9uYWxQcm9wZXJ0aWVzJzogZmFsc2UsXG4gICAgICB9LFxuICAgIF0sXG4gIH0sXG5cbiAgY3JlYXRlKGNvbnRleHQpIHtcbiAgICBjb25zdCBbe1xuICAgICAgZGV2RGVwZW5kZW5jaWVzLFxuICAgICAgb3B0aW9uYWxEZXBlbmRlbmNpZXMsXG4gICAgICBwZWVyRGVwZW5kZW5jaWVzLFxuICAgICAgcGFja2FnZURpcixcbiAgICAgfSA9IHt9XSA9IGNvbnRleHQub3B0aW9uc1xuICAgIGNvbnN0IGZpbGVuYW1lID0gY29udGV4dC5nZXRGaWxlbmFtZSgpXG4gICAgY29uc3QgZGVwcyA9IGdldERlcGVuZGVuY2llcyhjb250ZXh0LCBwYWNrYWdlRGlyLCBmaWxlbmFtZSlcblxuICAgIGlmICghZGVwcykge1xuICAgICAgcmV0dXJuIHt9XG4gICAgfVxuXG4gICAgY29uc3QgZGVwc09wdGlvbnMgPSB7XG4gICAgICBhbGxvd0RldkRlcHM6IHRlc3RDb25maWcoZGV2RGVwZW5kZW5jaWVzLCBmaWxlbmFtZSkgIT09IGZhbHNlLFxuICAgICAgYWxsb3dPcHREZXBzOiB0ZXN0Q29uZmlnKG9wdGlvbmFsRGVwZW5kZW5jaWVzLCBmaWxlbmFtZSkgIT09IGZhbHNlLFxuICAgICAgYWxsb3dQZWVyRGVwczogdGVzdENvbmZpZyhwZWVyRGVwZW5kZW5jaWVzLCBmaWxlbmFtZSkgIT09IGZhbHNlLFxuICAgIH1cblxuICAgIC8vIHRvZG86IHVzZSBtb2R1bGUgdmlzaXRvciBmcm9tIG1vZHVsZS11dGlscyBjb3JlXG4gICAgcmV0dXJuIHtcbiAgICAgIEltcG9ydERlY2xhcmF0aW9uOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICByZXBvcnRJZk1pc3NpbmcoY29udGV4dCwgZGVwcywgZGVwc09wdGlvbnMsIG5vZGUsIG5vZGUuc291cmNlLnZhbHVlKVxuICAgICAgfSxcbiAgICAgIENhbGxFeHByZXNzaW9uOiBmdW5jdGlvbiBoYW5kbGVSZXF1aXJlcyhub2RlKSB7XG4gICAgICAgIGlmIChpc1N0YXRpY1JlcXVpcmUobm9kZSkpIHtcbiAgICAgICAgICByZXBvcnRJZk1pc3NpbmcoY29udGV4dCwgZGVwcywgZGVwc09wdGlvbnMsIG5vZGUsIG5vZGUuYXJndW1lbnRzWzBdLnZhbHVlKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgfSxcbn1cbiJdfQ==