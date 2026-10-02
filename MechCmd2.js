// include: shell.js
// include: minimum_runtime_check.js
// end include: minimum_runtime_check.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// In MODULARIZE mode _scriptName needs to be captured already at the very top of the page immediately when the page is parsed, so it is generated there
// before the page load. In non-MODULARIZE modes generate it here.
var _scriptName = globalThis.document?.currentScript?.src;

if (typeof __filename != 'undefined') { // Node
  _scriptName = __filename;
} else
if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('node:fs');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename);
  return ret;
};

readAsync = async (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');
  return ret;
};
// end include: node_shell_read.js
  if (process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  arguments_ = process.argv.slice(2);

  // MODULARIZE will export the module in the proper place outside, we don't need to export here
  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
  } catch {
    // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
    // infer anything from them.
  }

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = async (url) => {
    // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
    // See https://github.com/github/fetch/pull/92#issuecomment-140665932
    // Cordova or Electron apps are typically loaded from a file:// url.
    // So use XHR on webview if URL is a file URL.
    if (isFileURI(url)) {
      return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            resolve(xhr.response);
            return;
          }
          reject(xhr.status);
        };
        xhr.onerror = reject;
        xhr.send(null);
      });
    }
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
}

var out = console.log.bind(console);
var err = console.error.bind(console);

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;

// Wasm globals

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    // This build was created without ASSERTIONS defined.  `assert()` should not
    // ever be called in this configuration but in case there are callers in
    // the wild leave this simple abort() implementation here for now.
    abort(text);
  }
}

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_common.js
// include: runtime_stack_check.js
// end include: runtime_stack_check.js
// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH {}

class EmscriptenSjLj extends EmscriptenEH {}

// end include: runtime_exceptions.js
// include: runtime_debug.js
// end include: runtime_debug.js
// Memory management

var runtimeInitialized = false;



function updateMemoryViews() {
  var b = wasmMemory.buffer;
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  HEAPU8 = new Uint8Array(b);
  HEAPU16 = new Uint16Array(b);
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  HEAPF32 = new Float32Array(b);
  HEAPF64 = new Float64Array(b);
  HEAP64 = new BigInt64Array(b);
  HEAPU64 = new BigUint64Array(b);
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
function preRun() {
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
  // End ATPRERUNS hooks
}

function initRuntime() {
  runtimeInitialized = true;

  // No ATINITS hooks

  wasmExports['__wasm_call_ctors']();

  // No ATPOSTCTORS hooks
}

function preMain() {
  // No ATMAINS hooks
}

function postRun() {
   // PThreads reuse the runtime from the main thread.

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
  // End ATPOSTRUNS hooks
}

/**
 * @param {string|number=} what
 */
function abort(what) {
  Module['onAbort']?.(what);

  what = `Aborted(${what})`;
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  what += '. Build with -sASSERTIONS for more info.';

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

var wasmBinaryFile;

function findWasmBinary() {
  return locateFile('MechCmd2.wasm');
}

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  // Throwing a plain string here, even though it not normally advisable since
  // this gets turning into an `abort` in instantiateArrayBuffer.
  throw 'both async and sync fetching of the wasm failed';
}

async function getWasmBinary(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    try {
      var response = await readAsync(binaryFile);
      return new Uint8Array(response);
    } catch {
      // Fall back to getBinarySync below;
    }
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  if (!binary
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      && !isFileURI(binaryFile)
      // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      && !ENVIRONMENT_IS_NODE
     ) {
    try {
      var response = fetch(binaryFile, { credentials: 'same-origin' });
      var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
      return instantiationResult;
    } catch (reason) {
      // We expect the most common failure cause to be a bad MIME type for the binary,
      // in which case falling back to ArrayBuffer instantiation should work.
      err(`wasm streaming compile failed: ${reason}`);
      err('falling back to ArrayBuffer instantiation');
      // fall back of instantiateArrayBuffer below
    };
  }
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  var imports = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  return imports;
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;

    wasmExports = Asyncify.instrumentWasmExports(wasmExports);

    assignWasmExports(wasmExports);

    updateMemoryViews();

    removeRunDependency('wasm-instantiate');
    return wasmExports;
  }
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result['instance']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {
    return new Promise((resolve, reject) => {
        Module['instantiateWasm'](info, (inst, mod) => {
          resolve(receiveInstance(inst, mod));
        });
    });
  }

  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  /** @type {!Int16Array} */
  var HEAP16;

  /** @type {!Int32Array} */
  var HEAP32;

  /** not-@type {!BigInt64Array} */
  var HEAP64;

  /** @type {!Int8Array} */
  var HEAP8;

  /** @type {!Float32Array} */
  var HEAPF32;

  /** @type {!Float64Array} */
  var HEAPF64;

  /** @type {!Uint16Array} */
  var HEAPU16;

  /** @type {!Uint32Array} */
  var HEAPU32;

  /** not-@type {!BigUint64Array} */
  var HEAPU64;

  /** @type {!Uint8Array} */
  var HEAPU8;

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);

  var runDependencies = 0;
  
  
  var dependenciesFulfilled = null;
  var removeRunDependency = (id) => {
      runDependencies--;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      if (runDependencies == 0) {
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback(); // can add another dependenciesFulfilled
        }
      }
    };
  var addRunDependency = (id) => {
      runDependencies++;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
    };


  var dynCalls = {
  };
  var dynCallLegacy = (sig, ptr, args) => {
      sig = sig.replace(/p/g, 'i')
      var f = dynCalls[sig];
      return f(ptr, ...args);
    };
  var dynCall = (sig, ptr, args = [], promising = false) => {
      var rtn = dynCallLegacy(sig, ptr, args);
  
      function convert(rtn) {
        return rtn;
      }
  
      return convert(rtn);
    };

  
    /**
   * @param {number} ptr
   * @param {string} type
   */
  function getValue(ptr, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': return HEAP8[ptr];
      case 'i8': return HEAP8[ptr];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP64[((ptr)>>3)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      case '*': return HEAPU32[((ptr)>>2)];
      default: abort(`invalid type for getValue: ${type}`);
    }
  }

  var noExitRuntime = true;


  
    /**
   * @param {number} ptr
   * @param {number} value
   * @param {string} type
   */
  function setValue(ptr, value, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': HEAP8[ptr] = value; break;
      case 'i8': HEAP8[ptr] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': HEAP64[((ptr)>>3)] = BigInt(value); break;
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      case '*': HEAPU32[((ptr)>>2)] = value; break;
      default: abort(`invalid type for setValue: ${type}`);
    }
  }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  

  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // As a tiny code save trick, compare idx against maxIdx using a negation,
      // so that maxBytesToRead=undefined/NaN means Infinity.
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    };
  
    /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
  
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
  
      // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
    /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';
    };
  var ___assert_fail = (condition, filename, line, func) =>
      abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);

  class ExceptionInfo {
      // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
      constructor(excPtr) {
        this.excPtr = excPtr;
        this.ptr = excPtr - 24;
      }
  
      set_type(type) {
        HEAPU32[(((this.ptr)+(4))>>2)] = type;
      }
  
      get_type() {
        return HEAPU32[(((this.ptr)+(4))>>2)];
      }
  
      set_destructor(destructor) {
        HEAPU32[(((this.ptr)+(8))>>2)] = destructor;
      }
  
      get_destructor() {
        return HEAPU32[(((this.ptr)+(8))>>2)];
      }
  
      set_caught(caught) {
        caught = caught ? 1 : 0;
        HEAP8[(this.ptr)+(12)] = caught;
      }
  
      get_caught() {
        return HEAP8[(this.ptr)+(12)] != 0;
      }
  
      set_rethrown(rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[(this.ptr)+(13)] = rethrown;
      }
  
      get_rethrown() {
        return HEAP8[(this.ptr)+(13)] != 0;
      }
  
      // Initialize native structure fields. Should be called once after allocated.
      init(type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      }
  
      set_adjusted_ptr(adjustedPtr) {
        HEAPU32[(((this.ptr)+(16))>>2)] = adjustedPtr;
      }
  
      get_adjusted_ptr() {
        return HEAPU32[(((this.ptr)+(16))>>2)];
      }
    }
  
  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
      var info = new ExceptionInfo(ptr);
      // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
      info.init(type, destructor);
      uncaughtExceptionCount++;
      abort()
    };

  var __abort_js = () =>
      abort('');

  var __emscripten_throw_longjmp = () => {
      throw new EmscriptenSjLj;
    };

  var isLeapYear = (year) => year%4 === 0 && (year%100 !== 0 || year%400 === 0);
  
  var MONTH_DAYS_LEAP_CUMULATIVE = [0,31,60,91,121,152,182,213,244,274,305,335];
  
  var MONTH_DAYS_REGULAR_CUMULATIVE = [0,31,59,90,120,151,181,212,243,273,304,334];
  var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1
  
      return yday;
    };
  
  var INT53_MAX = 9007199254740992;
  
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
  function __localtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
  
  
      var date = new Date(time*1000);
      HEAP32[((tmPtr)>>2)] = date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getDay();
  
      var yday = ydayFromDate(date)|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      HEAP32[(((tmPtr)+(36))>>2)] = -(date.getTimezoneOffset() * 60);
  
      // Attention: DST is in December in South, and some regions don't have DST at all.
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset))|0;
      HEAP32[(((tmPtr)+(32))>>2)] = dst;
    ;
  }

  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0))
        return 0;
  
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.codePointAt(i);
        if (u <= 0x7F) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 0xC0 | (u >> 6);
          heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 0xE0 | (u >> 12);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 0xF0 | (u >> 18);
          heap[outIdx++] = 0x80 | ((u >> 12) & 63);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
          // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
          // We need to manually skip over the second code unit for correct iteration.
          i++;
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      // TODO: Use (malleable) environment variables instead of system settings.
      var currentYear = new Date().getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
  
      // Local standard timezone offset. Local standard time is not adjusted for
      // daylight savings.  This code uses the fact that getTimezoneOffset returns
      // a greater value during Standard Time versus Daylight Saving Time (DST).
      // Thus it determines the expected output during Standard Time, and it
      // compares whether the output of the given date the same (Standard) or less
      // (DST).
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
  
      // timezone is specified as seconds west of UTC ("The external variable
      // `timezone` shall be set to the difference, in seconds, between
      // Coordinated Universal Time (UTC) and local standard time."), the same
      // as returned by stdTimezoneOffset.
      // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
      HEAPU32[((timezone)>>2)] = stdTimezoneOffset * 60;
  
      HEAP32[((daylight)>>2)] = Number(winterOffset != summerOffset);
  
      var extractZone = (timezoneOffset) => {
        // Why inverse sign?
        // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
        var sign = timezoneOffset >= 0 ? "-" : "+";
  
        var absOffset = Math.abs(timezoneOffset)
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
  
        return `UTC${sign}${hours}${minutes}`;
      }
  
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      if (summerOffset < winterOffset) {
        // Northern hemisphere
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };

  var __wasmfs_copy_preloaded_file_data = (index, buffer) =>
      HEAPU8.set(wasmFSPreloadedFiles[index].fileData, buffer);

  var wasmFSPreloadedDirs = [];
  var __wasmfs_get_num_preloaded_dirs = () => wasmFSPreloadedDirs.length;

  var wasmFSPreloadedFiles = [];
  
  var wasmFSPreloadingFlushed = false;
  var __wasmfs_get_num_preloaded_files = () => {
      // When this method is called from WasmFS it means that we are about to
      // flush all the preloaded data, so mark that. (There is no call that
      // occurs at the end of that flushing, which would be more natural, but it
      // is fine to mark the flushing here as during the flushing itself no user
      // code can run, so nothing will check whether we have flushed or not.)
      wasmFSPreloadingFlushed = true;
      return wasmFSPreloadedFiles.length;
    };

  var __wasmfs_get_preloaded_child_path = (index, childNameBuffer) => {
      var s = wasmFSPreloadedDirs[index].childName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, childNameBuffer, len);
    };

  var __wasmfs_get_preloaded_file_mode = (index) => wasmFSPreloadedFiles[index].mode;

  var __wasmfs_get_preloaded_file_size = (index) =>
      wasmFSPreloadedFiles[index].fileData.length;

  var __wasmfs_get_preloaded_parent_path = (index, parentPathBuffer) => {
      var s = wasmFSPreloadedDirs[index].parentPath;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, parentPathBuffer, len);
    };

  var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i); // possibly a lead surrogate
        if (c <= 0x7F) {
          len++;
        } else if (c <= 0x7FF) {
          len += 2;
        } else if (c >= 0xD800 && c <= 0xDFFF) {
          len += 4; ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
  
  var __wasmfs_get_preloaded_path_name = (index, fileNameBuffer) => {
      var s = wasmFSPreloadedFiles[index].pathName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, fileNameBuffer, len);
    };

  class HandleAllocator {
      allocated = [undefined];
      freelist = [];
      get(id) {
        return this.allocated[id];
      }
      has(id) {
        return this.allocated[id] !== undefined;
      }
      allocate(handle) {
        var id = this.freelist.pop() || this.allocated.length;
        this.allocated[id] = handle;
        return id;
      }
      free(id) {
        // Set the slot to `undefined` rather than using `delete` here since
        // apparently arrays with holes in them can be less efficient.
        this.allocated[id] = undefined;
        this.freelist.push(id);
      }
    }
  var wasmfsOPFSAccessHandles = new HandleAllocator();
  
  var wasmfsOPFSProxyFinish = (ctx) => {
      // When using pthreads the proxy needs to know when the work is finished.
      // When used with JSPI the work will be executed in an async block so there
      // is no need to notify when done.
    };
  var __wasmfs_opfs_close_access = function(ctx, accessID, errPtr) {
    let innerFunc = async  () => {
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.close();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSAccessHandles.free(accessID);
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_close_access.isAsync = true;

  var wasmfsOPFSBlobs = new HandleAllocator();
  var __wasmfs_opfs_close_blob = (blobID) => {
      wasmfsOPFSBlobs.free(blobID);
    };

  
  var __wasmfs_opfs_flush_access = function(ctx, accessID, errPtr) {
    let innerFunc = async  () => {
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.flush();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_flush_access.isAsync = true;

  var wasmfsOPFSDirectoryHandles = new HandleAllocator();
  var __wasmfs_opfs_free_directory = (dirID) => {
      wasmfsOPFSDirectoryHandles.free(dirID);
    };

  var wasmfsOPFSFileHandles = new HandleAllocator();
  var __wasmfs_opfs_free_file = (fileID) => {
      wasmfsOPFSFileHandles.free(fileID);
    };

  
  var wasmfsOPFSGetOrCreateFile = async (parent, name, create) => {
      let parentHandle = wasmfsOPFSDirectoryHandles.get(parent);
      let fileHandle;
      try {
        fileHandle = await parentHandle.getFileHandle(name, {create: create});
      } catch (e) {
        if (e.name === "NotFoundError") {
          return -20;
        }
        if (e.name === "TypeMismatchError") {
          return -31;
        }
        return -29;
      }
      return wasmfsOPFSFileHandles.allocate(fileHandle);
    };
  
  var wasmfsOPFSGetOrCreateDir = async (parent, name, create) => {
      let parentHandle = wasmfsOPFSDirectoryHandles.get(parent);
      let childHandle;
      try {
        childHandle =
            await parentHandle.getDirectoryHandle(name, {create: create});
      } catch (e) {
        if (e.name === "NotFoundError") {
          return -20;
        }
        if (e.name === "TypeMismatchError") {
          return -54;
        }
        return -29;
      }
      return wasmfsOPFSDirectoryHandles.allocate(childHandle);
    };
  
  
  var __wasmfs_opfs_get_child = function(ctx, parent, namePtr, childTypePtr, childIDPtr) {
    let innerFunc = async  () => {
  
      let name = UTF8ToString(namePtr);
      let childType = 1;
      let childID = await wasmfsOPFSGetOrCreateFile(parent, name, false);
      if (childID == -31) {
        childType = 2;
        childID = await wasmfsOPFSGetOrCreateDir(parent, name, false);
      }
      HEAP32[((childTypePtr)>>2)] = childType;
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_get_child.isAsync = true;

  
  
  
  var __wasmfs_opfs_get_entries = function(ctx, dirID, entriesPtr, errPtr) {
    let innerFunc = async  () => {
  
      let dirHandle = wasmfsOPFSDirectoryHandles.get(dirID);
  
      // TODO: Use 'for await' once Acorn supports that.
      try {
        let iter = dirHandle.entries();
        for (let entry; entry = await iter.next(), !entry.done;) {
          let [name, child] = entry.value;
          let sp = stackSave();
          let namePtr = stringToUTF8OnStack(name);
          let type = child.kind == "file" ?
              1 :
              2;
            __wasmfs_opfs_record_entry(entriesPtr, namePtr, type)
          stackRestore(sp);
        }
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_get_entries.isAsync = true;

  
  var __wasmfs_opfs_get_size_access = function(ctx, accessID, sizePtr) {
    let innerFunc = async  () => {
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let size;
      try {
        size = await accessHandle.getSize();
      } catch {
        size = -29;
      }
      HEAP64[((sizePtr)>>3)] = BigInt(size);
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_get_size_access.isAsync = true;

  
  var __wasmfs_opfs_get_size_blob = function(blobID) {
  
  var ret = (() => { 
      // This cannot fail.
  	  return wasmfsOPFSBlobs.get(blobID).size;
     })();
  return BigInt(ret);
  };

  
  var __wasmfs_opfs_get_size_file = function(ctx, fileID, sizePtr) {
    let innerFunc = async  () => {
  
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let size;
      try {
        size = (await fileHandle.getFile()).size;
      } catch {
        size = -29;
      }
      HEAP64[((sizePtr)>>3)] = BigInt(size);
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_get_size_file.isAsync = true;

  
  var __wasmfs_opfs_init_root_directory = function(ctx) {
    let innerFunc = async  () => {
  
      // allocated.length starts off as 1 since 0 is a reserved handle
      if (wasmfsOPFSDirectoryHandles.allocated.length == 1) {
        // Closure compiler errors on this as it does not recognize the OPFS
        // API yet, it seems. Unfortunately an existing annotation for this is in
        // the closure compiler codebase, and cannot be overridden in user code
        // (it complains on a duplicate type annotation), so just suppress it.
        /** @suppress {checkTypes} */
        let root = await navigator.storage.getDirectory();
        wasmfsOPFSDirectoryHandles.allocated.push(root);
      }
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_init_root_directory.isAsync = true;

  
  
  var __wasmfs_opfs_insert_directory = function(ctx, parent, namePtr, childIDPtr) {
    let innerFunc = async  () => {
  
      let name = UTF8ToString(namePtr);
      let childID = await wasmfsOPFSGetOrCreateDir(parent, name, true);
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_insert_directory.isAsync = true;

  
  
  var __wasmfs_opfs_insert_file = function(ctx, parent, namePtr, childIDPtr) {
    let innerFunc = async  () => {
  
      let name = UTF8ToString(namePtr);
      let childID = await wasmfsOPFSGetOrCreateFile(parent, name, true);
      HEAP32[((childIDPtr)>>2)] = childID;
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_insert_file.isAsync = true;

  
  
  
  var __wasmfs_opfs_move_file = function(ctx, fileID, newParentID, namePtr, errPtr) {
    let innerFunc = async  () => {
  
      let name = UTF8ToString(namePtr);
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let newDirHandle = wasmfsOPFSDirectoryHandles.get(newParentID);
      try {
        await fileHandle.move(newDirHandle, name);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_move_file.isAsync = true;

  
  
  
  class FileSystemAsyncAccessHandle {
      // This class implements the same interface as the sync version, but has
      // async reads and writes. Hopefully this will one day be implemented by the
      // platform so we can remove it.
      constructor(handle) {
        this.handle = handle;
      }
      async close() {}
      async flush() {}
      async getSize() {
        let file = await this.handle.getFile();
        return file.size;
      }
      async read(buffer, options = { at: 0 }) {
        let file = await this.handle.getFile();
        // The end position may be past the end of the file, but slice truncates
        // it.
        let slice = await file.slice(options.at, options.at + buffer.length);
        let fileBuffer = await slice.arrayBuffer();
        let array = new Uint8Array(fileBuffer);
        buffer.set(array);
        return array.length;
      }
      async write(buffer, options = { at: 0 }) {
        let writable = await this.handle.createWritable({keepExistingData: true});
        await writable.write({ type: 'write', position: options.at, data: buffer });
        await writable.close();
        return buffer.length;
      }
      async truncate(size) {
        let writable = await this.handle.createWritable({keepExistingData: true});
        await writable.truncate(size);
        await writable.close();
      }
    }
  var wasmfsOPFSCreateAsyncAccessHandle = (fileHandle) => new FileSystemAsyncAccessHandle(fileHandle);
  var __wasmfs_opfs_open_access = function(ctx, fileID, accessIDPtr) {
    let innerFunc = async  () => {
  
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let accessID;
      try {
        let accessHandle;
        accessHandle = await wasmfsOPFSCreateAsyncAccessHandle(fileHandle);
        accessID = wasmfsOPFSAccessHandles.allocate(accessHandle);
      } catch (e) {
        // TODO: Presumably only one of these will appear in the final API?
        if (e.name === "InvalidStateError" ||
            e.name === "NoModificationAllowedError") {
          accessID = -2;
        } else {
          accessID = -29;
        }
      }
      HEAP32[((accessIDPtr)>>2)] = accessID;
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_open_access.isAsync = true;

  
  
  var __wasmfs_opfs_open_blob = function(ctx, fileID, blobIDPtr) {
    let innerFunc = async  () => {
  
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      let blobID;
      try {
        let blob = await fileHandle.getFile();
        blobID = wasmfsOPFSBlobs.allocate(blob);
      } catch (e) {
        if (e.name === "NotAllowedError") {
          blobID = -2;
        } else {
          blobID = -29;
        }
      }
      HEAP32[((blobIDPtr)>>2)] = blobID;
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_open_blob.isAsync = true;

  
  var __wasmfs_opfs_read_access = function(accessID, bufPtr, len, pos) {
    let innerFunc = async  () => {
  
    pos = bigintToI53Checked(pos);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let data = HEAPU8.subarray(bufPtr, bufPtr + len);
      try {
        return await accessHandle.read(data, {at: pos});
      } catch (e) {
        if (e.name == "TypeError") {
          return -28;
        }
        return -29;
      }
    ;
  
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_read_access.isAsync = true;

  
  
  var __wasmfs_opfs_read_blob = function(ctx, blobID, bufPtr, len, pos, nreadPtr) {
    let innerFunc = async  () => {
  
    pos = bigintToI53Checked(pos);
  
  
      let blob = wasmfsOPFSBlobs.get(blobID);
      let slice = blob.slice(pos, pos + len);
      let nread = 0;
  
      try {
        // TODO: Use ReadableStreamBYOBReader once
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1189621 is
        // resolved.
        let buf = await slice.arrayBuffer();
        let data = new Uint8Array(buf);
        HEAPU8.set(data, bufPtr);
        nread += data.length;
      } catch (e) {
        if (e instanceof RangeError) {
          nread = -21;
        } else {
          nread = -29;
        }
      }
  
      HEAP32[((nreadPtr)>>2)] = nread;
      wasmfsOPFSProxyFinish(ctx);
    ;
  
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_read_blob.isAsync = true;

  
  
  var __wasmfs_opfs_remove_child = function(ctx, dirID, namePtr, errPtr) {
    let innerFunc = async  () => {
  
      let name = UTF8ToString(namePtr);
      let dirHandle = wasmfsOPFSDirectoryHandles.get(dirID);
      try {
        await dirHandle.removeEntry(name);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_remove_child.isAsync = true;

  
  
  var __wasmfs_opfs_set_size_access = function(ctx, accessID, size, errPtr) {
    let innerFunc = async  () => {
  
    size = bigintToI53Checked(size);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      try {
        await accessHandle.truncate(size);
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    ;
  
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_set_size_access.isAsync = true;

  
  
  var __wasmfs_opfs_set_size_file = function(ctx, fileID, size, errPtr) {
    let innerFunc = async  () => {
  
    size = bigintToI53Checked(size);
  
  
      let fileHandle = wasmfsOPFSFileHandles.get(fileID);
      try {
        let writable = await fileHandle.createWritable({keepExistingData: true});
        await writable.truncate(size);
        await writable.close();
      } catch {
        let err = -29;
        HEAP32[((errPtr)>>2)] = err;
      }
      wasmfsOPFSProxyFinish(ctx);
    ;
  
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_set_size_file.isAsync = true;

  
  var __wasmfs_opfs_write_access = function(accessID, bufPtr, len, pos) {
    let innerFunc = async  () => {
  
    pos = bigintToI53Checked(pos);
  
  
      let accessHandle = wasmfsOPFSAccessHandles.get(accessID);
      let data = HEAPU8.subarray(bufPtr, bufPtr + len);
      try {
        return await accessHandle.write(data, {at: pos});
      } catch (e) {
        if (e.name == "TypeError") {
          return -28;
        }
        return -29;
      }
    ;
  
  };
    return Asyncify.handleAsync(innerFunc);
  }
  ;
  __wasmfs_opfs_write_access.isAsync = true;

  var FS_stdin_getChar_buffer = [];
  
  
  /** @type {function(string, boolean=, number=)} */
  var intArrayFromString = (stringy, dontAddNull, length) => {
      var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    };
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (globalThis.window?.prompt) {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var __wasmfs_stdin_get_char = () => {
      // Return the read character, or -1 to indicate EOF.
      var c = FS_stdin_getChar();
      if (typeof c === 'number') {
        return c;
      }
      return -1;
    };

  var _emscripten_get_now = () => performance.now();
  
  var _emscripten_date_now = () => Date.now();
  
  var nowIsMonotonic = 1;
  
  var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;
  
  function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);
  
  
      if (!checkWasiClock(clk_id)) {
        return 28;
      }
      var now;
      // all wasi clocks but realtime are monotonic
      if (clk_id === 0) {
        now = _emscripten_date_now();
      } else if (nowIsMonotonic) {
        now = _emscripten_get_now();
      } else {
        return 52;
      }
      // "now" is in ms, and wasi times are in ns.
      var nsec = Math.round(now * 1000 * 1000);
      HEAP64[((ptime)>>3)] = BigInt(nsec);
      return 0;
    ;
  }

  var readEmAsmArgsArray = [];
  var readEmAsmArgs = (sigPtr, buf) => {
      readEmAsmArgsArray.length = 0;
      var ch;
      // Most arguments are i32s, so shift the buffer pointer so it is a plain
      // index into HEAP32.
      while (ch = HEAPU8[sigPtr++]) {
        // Floats are always passed as doubles, so all types except for 'i'
        // are 8 bytes and require alignment.
        var wide = (ch != 105);
        wide &= (ch != 112);
        buf += wide && (buf % 8) ? 4 : 0;
        readEmAsmArgsArray.push(
          // Special case for pointers under wasm64 or CAN_ADDRESS_2GB mode.
          ch == 112 ? HEAPU32[((buf)>>2)] :
          ch == 106 ? HEAP64[((buf)>>3)] :
          ch == 105 ?
            HEAP32[((buf)>>2)] :
            HEAPF64[((buf)>>3)]
        );
        buf += wide ? 8 : 4;
      }
      return readEmAsmArgsArray;
    };
  var runEmAsmFunction = (code, sigPtr, argbuf) => {
      var args = readEmAsmArgs(sigPtr, argbuf);
      return ASM_CONSTS[code](...args);
    };
  var _emscripten_asm_const_int = (code, sigPtr, argbuf) => {
      return runEmAsmFunction(code, sigPtr, argbuf);
    };

  
  var _emscripten_set_main_loop_timing = (mode, value) => {
      MainLoop.timingMode = mode;
      MainLoop.timingValue = value;
  
      if (!MainLoop.func) {
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (!MainLoop.running) {
        
        MainLoop.running = true;
      }
      if (mode == 0) {
        MainLoop.scheduler = function MainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, MainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(MainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
      } else if (mode == 1) {
        MainLoop.scheduler = function MainLoop_scheduler_rAF() {
          MainLoop.requestAnimationFrame(MainLoop.runner);
        };
      } else {
        if (!MainLoop.setImmediate) {
          if (globalThis.setImmediate) {
            MainLoop.setImmediate = setImmediate;
          } else {
            // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
            var setImmediates = [];
            var emscriptenMainLoopMessageId = 'setimmediate';
            /** @param {Event} event */
            var MainLoop_setImmediate_messageHandler = (event) => {
              // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
              // so check for both cases.
              if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
                event.stopPropagation();
                setImmediates.shift()();
              }
            };
            addEventListener("message", MainLoop_setImmediate_messageHandler, true);
            MainLoop.setImmediate = /** @type{function(function(): ?, ...?): number} */((func) => {
              setImmediates.push(func);
              if (ENVIRONMENT_IS_WORKER) {
                Module['setImmediates'] ??= [];
                Module['setImmediates'].push(func);
                postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
              } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
            });
          }
        }
        MainLoop.scheduler = function MainLoop_scheduler_setImmediate() {
          MainLoop.setImmediate(MainLoop.runner);
        };
      }
      return 0;
    };
  
  
  
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module['onExit']?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    };
  /** @param {boolean|number=} implicit */
  var exitJS = (status, implicit) => {
      EXITSTATUS = status;
  
      _proc_exit(status);
    };
  var _exit = exitJS;
  
  var handleException = (e) => {
      // Certain exception types we do not treat as errors since they are used for
      // internal control flow.
      // 1. ExitStatus, which is thrown by exit()
      // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
      //    that wish to return to JS event loop.
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      quit_(1, e);
    };
  
  var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
  
    /**
   * @param {number=} arg
   * @param {boolean=} noSetTiming
   */
  var setMainLoop = (iterFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
      MainLoop.func = iterFunc;
      MainLoop.arg = arg;
  
      var thisMainLoopId = MainLoop.currentlyRunningMainloop;
      function checkIsRunning() {
        if (thisMainLoopId < MainLoop.currentlyRunningMainloop) {
          
          maybeExit();
          return false;
        }
        return true;
      }
  
      // We create the loop runner here but it is not actually running until
      // _emscripten_set_main_loop_timing is called (which might happen at a
      // later time).  This member signifies that the current runner has not
      // yet been started so that we can call runtimeKeepalivePush when it
      // gets its timing set for the first time.
      MainLoop.running = false;
      MainLoop.runner = function MainLoop_runner() {
        if (ABORT) return;
        if (MainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = MainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (MainLoop.remainingBlockers) {
            var remaining = MainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              MainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              MainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          MainLoop.updateStatus();
  
          // catches pause/resume main loop from blocker execution
          if (!checkIsRunning()) return;
  
          setTimeout(MainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (!checkIsRunning()) return;
  
        // Implement very basic swap interval control
        MainLoop.currentFrameNumber = MainLoop.currentFrameNumber + 1 | 0;
        if (MainLoop.timingMode == 1 && MainLoop.timingValue > 1 && MainLoop.currentFrameNumber % MainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          MainLoop.scheduler();
          return;
        } else if (MainLoop.timingMode == 0) {
          MainLoop.tickStartTime = _emscripten_get_now();
        }
  
        MainLoop.runIter(iterFunc);
  
        // catch pauses from the main loop itself
        if (!checkIsRunning()) return;
  
        MainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps > 0) {
          _emscripten_set_main_loop_timing(0, 1000.0 / fps);
        } else {
          // Do rAF by rendering each frame (no decimating)
          _emscripten_set_main_loop_timing(1, 1);
        }
  
        MainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'unwind';
      }
    };
  
  
  var callUserCallback = (func) => {
      if (ABORT) {
        return;
      }
      try {
        return func();
      } catch (e) {
        handleException(e);
      } finally {
        maybeExit();
      }
    };
  
  var MainLoop = {
  running:false,
  scheduler:null,
  currentlyRunningMainloop:0,
  func:null,
  arg:0,
  timingMode:0,
  timingValue:0,
  currentFrameNumber:0,
  queue:[],
  preMainLoop:[],
  postMainLoop:[],
  pause() {
        MainLoop.scheduler = null;
        // Incrementing this signals the previous main loop that it's now become old, and it must return.
        MainLoop.currentlyRunningMainloop++;
      },
  resume() {
        MainLoop.currentlyRunningMainloop++;
        var timingMode = MainLoop.timingMode;
        var timingValue = MainLoop.timingValue;
        var func = MainLoop.func;
        MainLoop.func = null;
        // do not set timing and call scheduler, we will do it on the next lines
        setMainLoop(func, 0, false, MainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        MainLoop.scheduler();
      },
  updateStatus() {
        if (Module['setStatus']) {
          var message = Module['statusMessage'] || 'Please wait...';
          var remaining = MainLoop.remainingBlockers ?? 0;
          var expected = MainLoop.expectedBlockers ?? 0;
          if (remaining) {
            if (remaining < expected) {
              Module['setStatus'](`{message} ({expected - remaining}/{expected})`);
            } else {
              Module['setStatus'](message);
            }
          } else {
            Module['setStatus']('');
          }
        }
      },
  init() {
        Module['preMainLoop'] && MainLoop.preMainLoop.push(Module['preMainLoop']);
        Module['postMainLoop'] && MainLoop.postMainLoop.push(Module['postMainLoop']);
      },
  runIter(func) {
        if (ABORT) return;
        for (var pre of MainLoop.preMainLoop) {
          if (pre() === false) {
            return; // |return false| skips a frame
          }
        }
        callUserCallback(func);
        for (var post of MainLoop.postMainLoop) {
          post();
        }
      },
  nextRAF:0,
  fakeRequestAnimationFrame(func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (MainLoop.nextRAF === 0) {
          MainLoop.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= MainLoop.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            MainLoop.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(MainLoop.nextRAF - now, 0);
        setTimeout(func, delay);
      },
  requestAnimationFrame(func) {
        if (globalThis.requestAnimationFrame) {
          requestAnimationFrame(func);
        } else {
          MainLoop.fakeRequestAnimationFrame(func);
        }
      },
  };
  var _emscripten_cancel_main_loop = () => {
      MainLoop.pause();
      MainLoop.func = null;
    };

  var _emscripten_clear_interval = (id) => {
      
      clearInterval(id);
    };


  var _emscripten_err = (str) => err(UTF8ToString(str));

  var maybeCStringToJsString = (cString) => {
      // "cString > 2" checks if the input is a number, and isn't of the special
      // values we accept here, EMSCRIPTEN_EVENT_TARGET_* (which map to 0, 1, 2).
      // In other words, if cString > 2 then it's a pointer to a valid place in
      // memory, and points to a C string.
      return cString > 2 ? UTF8ToString(cString) : cString;
    };
  
  /** @type {Object} */
  var specialHTMLTargets = [0, globalThis.document ?? 0, globalThis.window ?? 0];
  var findEventTarget = (target) => {
      target = maybeCStringToJsString(target);
      var domElement = specialHTMLTargets[target] || globalThis.document?.querySelector(target);
      return domElement;
    };
  
  var getBoundingClientRect = (e) => specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : {'left':0,'top':0};
  var _emscripten_get_element_css_size = (target, width, height) => {
      target = findEventTarget(target);
      if (!target) return -4;
  
      var rect = getBoundingClientRect(target);
      HEAPF64[((width)>>3)] = rect.width;
      HEAPF64[((height)>>3)] = rect.height;
  
      return 0;
    };


  var _emscripten_has_asyncify = () => 1;

  var _emscripten_out = (str) => out(UTF8ToString(str));

  var getHeapMax = () =>
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648;
  
  var alignMemory = (size, alignment) => {
      return Math.ceil(size / alignment) * alignment;
    };
  
  var growMemory = (size) => {
      var oldHeapSize = wasmMemory.buffer.byteLength;
      var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
        updateMemoryViews();
        return 1 /*success*/;
      } catch(e) {
      }
      // implicit 0 return to save code size (caller will cast "undefined" into 0
      // anyhow)
    };
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      // With multithreaded builds, races can happen (another thread might increase the size
      // in between), so return a failure, and let the caller retry.
  
      // Memory resize rules:
      // 1.  Always increase heap size to at least the requested size, rounded up
      //     to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
      //     geometrically: increase the heap size according to
      //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
      //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
      //     linearly: increase the heap size by at least
      //     MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
      //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4.  If we were unable to allocate as much memory, it may be due to
      //     over-eager decision to excessively reserve due to (3) above.
      //     Hence if an allocation fails, cut down on the amount of excess
      //     growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager
      // reservation that fails, cut down on the attempted size and reserve a
      // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = growMemory(newSize);
        if (replacement) {
  
          return true;
        }
      }
      return false;
    };

  /** @returns {number} */
  var convertFrameToPC = (frame) => {
      var match;
  
      if (match = /\bwasm-function\[\d+\]:(0x[0-9a-f]+)/.exec(frame)) {
        // Wasm engines give the binary offset directly, so we use that as return address
        return +match[1];
      } else if (match = /:(\d+):\d+(?:\)|$)/.exec(frame)) {
        // If we are in js, we can use the js line number as the "return address".
        // This should work for wasm2js.  We tag the high bit to distinguish this
        // from wasm addresses.
        return 0x80000000 | +match[1];
      }
      // return 0 if we can't find any
      return 0;
    };
  
  var jsStackTrace = () => new Error().stack.toString();
  var _emscripten_return_address = (level) => {
      var callstack = jsStackTrace().split('\n');
      if (callstack[0] == 'Error') {
        callstack.shift();
      }
      // skip this function and the caller to get caller's return address
      var caller = callstack[level + 3];
      return convertFrameToPC(caller);
    };

  var _emscripten_run_script = (ptr) => {
      eval(UTF8ToString(ptr));
    };

  var onExits = [];
  var addOnExit = (cb) => onExits.push(cb);
  var JSEvents = {
  removeAllEventListeners() {
        while (JSEvents.eventHandlers.length) {
          JSEvents._removeHandler(JSEvents.eventHandlers.length - 1);
        }
        JSEvents.deferredCalls = [];
      },
  inEventHandler:0,
  deferredCalls:[],
  deferCall(targetFunction, precedence, argsList) {
        function arraysHaveEqualContent(arrA, arrB) {
          if (arrA.length != arrB.length) return false;
  
          for (var i in arrA) {
            if (arrA[i] != arrB[i]) return false;
          }
          return true;
        }
        // Test if the given call was already queued, and if so, don't add it again.
        for (var call of JSEvents.deferredCalls) {
          if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
            return;
          }
        }
        JSEvents.deferredCalls.push({
          targetFunction,
          precedence,
          argsList
        });
  
        JSEvents.deferredCalls.sort((x,y) => x.precedence - y.precedence);
      },
  removeDeferredCalls(targetFunction) {
        JSEvents.deferredCalls = JSEvents.deferredCalls.filter((call) => call.targetFunction != targetFunction);
      },
  canPerformEventHandlerRequests() {
        if (navigator.userActivation) {
          // Verify against transient activation status from UserActivation API
          // whether it is possible to perform a request here without needing to defer. See
          // https://developer.mozilla.org/en-US/docs/Web/Security/User_activation#transient_activation
          // and https://caniuse.com/mdn-api_useractivation
          // At the time of writing, Firefox does not support this API: https://bugzil.la/1791079
          return navigator.userActivation.isActive;
        }
  
        return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
      },
  runDeferredCalls() {
        if (!JSEvents.canPerformEventHandlerRequests()) {
          return;
        }
        var deferredCalls = JSEvents.deferredCalls;
        JSEvents.deferredCalls = [];
        for (var call of deferredCalls) {
          call.targetFunction(...call.argsList);
        }
      },
  eventHandlers:[],
  removeAllHandlersOnTarget:(target, eventTypeString) => {
        for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
          if (JSEvents.eventHandlers[i].target == target &&
            (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
             JSEvents._removeHandler(i--);
           }
        }
      },
  _removeHandler(i) {
        var h = JSEvents.eventHandlers[i];
        h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
        JSEvents.eventHandlers.splice(i, 1);
      },
  registerOrRemoveHandler(eventHandler) {
        if (!eventHandler.target) {
          return -4;
        }
        if (eventHandler.callbackfunc) {
          eventHandler.eventListenerFunc = function(event) {
            // Increment nesting count for the event handler.
            ++JSEvents.inEventHandler;
            JSEvents.currentEventHandler = eventHandler;
            // Process any old deferred calls the user has placed.
            JSEvents.runDeferredCalls();
            // Process the actual event, calls back to user C code handler.
            eventHandler.handlerFunc(event);
            // Process any new deferred calls that were placed right now from this event handler.
            JSEvents.runDeferredCalls();
            // Out of event handler - restore nesting count.
            --JSEvents.inEventHandler;
          };
  
          eventHandler.target.addEventListener(eventHandler.eventTypeString,
                                               eventHandler.eventListenerFunc,
                                               eventHandler.useCapture);
          JSEvents.eventHandlers.push(eventHandler);
        } else {
          for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
            if (JSEvents.eventHandlers[i].target == eventHandler.target
             && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
               JSEvents._removeHandler(i--);
             }
          }
        }
        return 0;
      },
  removeSingleHandler(eventHandler) {
        let success = false;
        for (let i = 0; i < JSEvents.eventHandlers.length; ++i) {
          const handler = JSEvents.eventHandlers[i];
          if (handler.target === eventHandler.target
            && handler.eventTypeId === eventHandler.eventTypeId
            && handler.callbackfunc === eventHandler.callbackfunc
            && handler.userData === eventHandler.userData) {
            // in some very rare cases (ex: Safari / fullscreen events), there is more than 1 handler (eventTypeString is different)
            JSEvents._removeHandler(i--);
            success = true;
          }
        }
        return success ? 0 : -5;
      },
  getNodeNameForTarget(target) {
        if (!target) return '';
        if (target == window) return '#window';
        if (target == screen) return '#screen';
        return target?.nodeName || '';
      },
  fullscreenEnabled() {
        return document.fullscreenEnabled
        // Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitFullscreenEnabled.
        // TODO: If Safari at some point ships with unprefixed version, update the version check above.
        || document.webkitFullscreenEnabled
         ;
      },
  };
  
  
  
  var registerFocusEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
      var eventSize = 256;
      JSEvents.focusEvent ||= _malloc(eventSize);
  
      var focusEventHandlerFunc = (e) => {
        var nodeName = JSEvents.getNodeNameForTarget(e.target);
        var id = e.target.id ? e.target.id : '';
  
        var focusEvent = JSEvents.focusEvent;
        stringToUTF8(nodeName, focusEvent + 0, 128);
        stringToUTF8(id, focusEvent + 128, 128);
  
        if (((a1, a2, a3) => dynCall_iiii(callbackfunc, a1, a2, a3))(eventTypeId, focusEvent, userData)) e.preventDefault();
      };
  
      var eventHandler = {
        target: findEventTarget(target),
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: focusEventHandlerFunc,
        useCapture
      };
      return JSEvents.registerOrRemoveHandler(eventHandler);
    };
  var _emscripten_set_blur_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);

  
  
  
  var registerKeyEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
      var eventSize = 160;
      JSEvents.keyEvent ||= _malloc(eventSize);
  
      var keyEventHandlerFunc = (e) => {
  
        var keyEventData = JSEvents.keyEvent;
        HEAPF64[((keyEventData)>>3)] = e.timeStamp;
  
        var idx = ((keyEventData)>>2);
  
        HEAP32[idx + 2] = e.location;
        HEAP8[keyEventData + 12] = e.ctrlKey;
        HEAP8[keyEventData + 13] = e.shiftKey;
        HEAP8[keyEventData + 14] = e.altKey;
        HEAP8[keyEventData + 15] = e.metaKey;
        HEAP8[keyEventData + 16] = e.repeat;
        HEAP32[idx + 5] = e.charCode;
        HEAP32[idx + 6] = e.keyCode;
        HEAP32[idx + 7] = e.which;
        stringToUTF8(e.key || '', keyEventData + 32, 32);
        stringToUTF8(e.code || '', keyEventData + 64, 32);
        stringToUTF8(e.char || '', keyEventData + 96, 32);
        stringToUTF8(e.locale || '', keyEventData + 128, 32);
  
        if (((a1, a2, a3) => dynCall_iiii(callbackfunc, a1, a2, a3))(eventTypeId, keyEventData, userData)) e.preventDefault();
      };
  
      var eventHandler = {
        target: findEventTarget(target),
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: keyEventHandlerFunc,
        useCapture
      };
      return JSEvents.registerOrRemoveHandler(eventHandler);
    };
  var _emscripten_set_keydown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);

  var _emscripten_set_keypress_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);

  var _emscripten_set_keyup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);

  var _emscripten_set_main_loop_arg = (func, arg, fps, simulateInfiniteLoop) => {
      var iterFunc = () => ((a1) => dynCall_vi(func, a1))(arg);
      setMainLoop(iterFunc, fps, simulateInfiniteLoop, arg);
    };

  
  var fillMouseEventData = (eventStruct, e, target) => {
      HEAPF64[((eventStruct)>>3)] = e.timeStamp;
      var idx = ((eventStruct)>>2);
      HEAP32[idx + 2] = e.screenX;
      HEAP32[idx + 3] = e.screenY;
      HEAP32[idx + 4] = e.clientX;
      HEAP32[idx + 5] = e.clientY;
      HEAP8[eventStruct + 24] = e.ctrlKey;
      HEAP8[eventStruct + 25] = e.shiftKey;
      HEAP8[eventStruct + 26] = e.altKey;
      HEAP8[eventStruct + 27] = e.metaKey;
      HEAP16[idx*2 + 14] = e.button;
      HEAP16[idx*2 + 15] = e.buttons;
  
      HEAP32[idx + 8] = e["movementX"];
  
      HEAP32[idx + 9] = e["movementY"];
  
      // Note: rect contains doubles (truncated to placate SAFE_HEAP, which is the same behaviour when writing to HEAP32 anyway)
      var rect = getBoundingClientRect(target);
      HEAP32[idx + 10] = e.clientX - (rect.left | 0);
      HEAP32[idx + 11] = e.clientY - (rect.top  | 0);
    };
  
  
  var registerMouseEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
      var eventSize = 64;
      JSEvents.mouseEvent ||= _malloc(eventSize);
      target = findEventTarget(target);
  
      var mouseEventHandlerFunc = (e) => {
        // TODO: Make this access thread safe, or this could update live while app is reading it.
        fillMouseEventData(JSEvents.mouseEvent, e, target);
  
        if (((a1, a2, a3) => dynCall_iiii(callbackfunc, a1, a2, a3))(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
      };
  
      var eventHandler = {
        target,
        allowsDeferredCalls: eventTypeString != 'mousemove' && eventTypeString != 'mouseenter' && eventTypeString != 'mouseleave', // Mouse move events do not allow fullscreen/pointer lock requests to be handled in them!
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: mouseEventHandlerFunc,
        useCapture
      };
      return JSEvents.registerOrRemoveHandler(eventHandler);
    };
  var _emscripten_set_mousedown_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);

  var _emscripten_set_mousemove_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);

  var _emscripten_set_mouseup_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) =>
      registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);

  
  
  var registerWheelEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
      var eventSize = 96;
      JSEvents.wheelEvent ||= _malloc(eventSize)
  
      // The DOM Level 3 events spec event 'wheel'
      var wheelHandlerFunc = (e) => {
        var wheelEvent = JSEvents.wheelEvent;
        fillMouseEventData(wheelEvent, e, target);
        HEAPF64[(((wheelEvent)+(64))>>3)] = e["deltaX"];
        HEAPF64[(((wheelEvent)+(72))>>3)] = e["deltaY"];
        HEAPF64[(((wheelEvent)+(80))>>3)] = e["deltaZ"];
        HEAP32[(((wheelEvent)+(88))>>2)] = e["deltaMode"];
        if (((a1, a2, a3) => dynCall_iiii(callbackfunc, a1, a2, a3))(eventTypeId, wheelEvent, userData)) e.preventDefault();
      };
  
      var eventHandler = {
        target,
        allowsDeferredCalls: true,
        eventTypeString,
        eventTypeId,
        userData,
        callbackfunc,
        handlerFunc: wheelHandlerFunc,
        useCapture
      };
      return JSEvents.registerOrRemoveHandler(eventHandler);
    };
  
  var _emscripten_set_wheel_callback_on_thread = (target, userData, useCapture, callbackfunc, targetThread) => {
      target = findEventTarget(target);
      if (!target) return -4;
      if (typeof target.onwheel != 'undefined') {
        return registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
      } else {
        return -1;
      }
    };

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
  
  
  
  var writeI53ToI64 = (ptr, num) => {
      HEAPU32[((ptr)>>2)] = num;
      var lower = HEAPU32[((ptr)>>2)];
      HEAPU32[(((ptr)+(4))>>2)] = (num - lower)/4294967296;
    };
  
  
  
  var stringToNewUTF8 = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = _malloc(size);
      if (ret) stringToUTF8(str, ret, size);
      return ret;
    };
  
  
  
  var readI53FromI64 = (ptr) => {
      return HEAPU32[((ptr)>>2)] + HEAP32[(((ptr)+(4))>>2)] * 4294967296;
    };
  
  var WebGPU = {
  Internals:{
  jsObjects:[],
  jsObjectInsert:(ptr, jsObject) => {
          ptr >>>= 0
          WebGPU.Internals.jsObjects[ptr] = jsObject;
        },
  bufferOnUnmaps:[],
  futures:[],
  futureInsert:(futureId, promise) => {
          WebGPU.Internals.futures[futureId] =
            new Promise((resolve) => promise.finally(() => resolve(futureId)));
        },
  },
  getJsObject:(ptr) => {
        if (!ptr) return undefined;
        ptr >>>= 0
        return WebGPU.Internals.jsObjects[ptr];
      },
  importJsAdapter:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateAdapter(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsBindGroup:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateBindGroup(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsBindGroupLayout:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateBindGroupLayout(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsBuffer:(buffer, parentPtr = 0) => {
        // At the moment, we do not allow importing pending buffers.
        assert(buffer.mapState === "unmapped");
        var bufferPtr = _emwgpuImportBuffer(parentPtr);
        WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);
        return bufferPtr;
      },
  importJsCommandBuffer:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateCommandBuffer(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsCommandEncoder:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateCommandEncoder(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsComputePassEncoder:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateComputePassEncoder(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsComputePipeline:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateComputePipeline(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsDevice:(device, parentPtr = 0) => {
        var queuePtr = _emwgpuCreateQueue(parentPtr);
        var devicePtr = _emwgpuCreateDevice(parentPtr, queuePtr);
        WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);
        WebGPU.Internals.jsObjectInsert(devicePtr, device);
        return devicePtr;
      },
  importJsExternalTexture:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateExternalTexture(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsPipelineLayout:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreatePipelineLayout(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsQuerySet:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateQuerySet(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsQueue:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateQueue(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsRenderBundle:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateRenderBundle(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsRenderBundleEncoder:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateRenderBundleEncoder(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsRenderPassEncoder:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateRenderPassEncoder(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsRenderPipeline:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateRenderPipeline(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsSampler:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateSampler(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsShaderModule:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateShaderModule(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsSurface:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateSurface(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsTexture:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateTexture(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  importJsTextureView:(obj, parentPtr = 0) => {
            var ptr = _emwgpuCreateTextureView(parentPtr);
            WebGPU.Internals.jsObjects[ptr] = obj;
            return ptr;
          },
  errorCallback:(callback, type, message, userdata) => {
        var sp = stackSave();
        var messagePtr = stringToUTF8OnStack(message);
        ((a1, a2, a3) => dynCall_viii(callback, a1, a2, a3))(type, messagePtr, userdata);
        stackRestore(sp);
      },
  iterateExtensions:(root, handlers) => {
        
        for (var ptr = HEAPU32[((root)>>2)]; ptr;
                 ptr = HEAPU32[((ptr)>>2)]) {
          var sType = HEAP32[(((ptr)+(4))>>2)];
          // This will crash if there's no handler indicating either a bogus
          // sType, or one we haven't implemented yet.
          var handler = handlers[sType](ptr);
        }
      },
  setStringView:(ptr, data, length) => {
        HEAPU32[((ptr)>>2)] = data;
        HEAPU32[(((ptr)+(4))>>2)] = length;
      },
  makeStringFromStringView:(stringViewPtr) => {
        var ptr = HEAPU32[((stringViewPtr)>>2)];
        var length = HEAPU32[(((stringViewPtr)+(4))>>2)];
        // UTF8ToString stops at the first null terminator character in the
        // string regardless of the length.
        return UTF8ToString(ptr, length);
      },
  makeStringFromOptionalStringView:(stringViewPtr) => {
        var ptr = HEAPU32[((stringViewPtr)>>2)];
        var length = HEAPU32[(((stringViewPtr)+(4))>>2)];
        // If we don't have a valid string pointer, just return undefined when
        // optional.
        if (!ptr) {
          if (length === 0) {
            return "";
          }
          return undefined;
        }
        // UTF8ToString stops at the first null terminator character in the
        // string regardless of the length.
        return UTF8ToString(ptr, length);
      },
  makeColor:(ptr) => {
        return {
          "r": HEAPF64[((ptr)>>3)],
          "g": HEAPF64[(((ptr)+(8))>>3)],
          "b": HEAPF64[(((ptr)+(16))>>3)],
          "a": HEAPF64[(((ptr)+(24))>>3)],
        };
      },
  makeExtent3D:(ptr) => {
        return {
          "width": HEAPU32[((ptr)>>2)],
          "height": HEAPU32[(((ptr)+(4))>>2)],
          "depthOrArrayLayers": HEAPU32[(((ptr)+(8))>>2)],
        };
      },
  makeOrigin3D:(ptr) => {
        return {
          "x": HEAPU32[((ptr)>>2)],
          "y": HEAPU32[(((ptr)+(4))>>2)],
          "z": HEAPU32[(((ptr)+(8))>>2)],
        };
      },
  makeTexelCopyTextureInfo:(ptr) => {
        
        return {
          "texture": WebGPU.getJsObject(
            HEAPU32[((ptr)>>2)]),
          "mipLevel": HEAPU32[(((ptr)+(4))>>2)],
          "origin": WebGPU.makeOrigin3D(ptr + 8),
          "aspect": WebGPU.TextureAspect[HEAP32[(((ptr)+(20))>>2)]],
        };
      },
  makeTexelCopyBufferLayout:(ptr) => {
        var bytesPerRow = HEAPU32[(((ptr)+(8))>>2)];
        var rowsPerImage = HEAPU32[(((ptr)+(12))>>2)];
        return {
          "offset": readI53FromI64(ptr),
          "bytesPerRow": bytesPerRow === 4294967295 ? undefined : bytesPerRow,
          "rowsPerImage": rowsPerImage === 4294967295 ? undefined : rowsPerImage,
        };
      },
  makeTexelCopyBufferInfo:(ptr) => {
        
        var layoutPtr = ptr + 0;
        var bufferCopyView = WebGPU.makeTexelCopyBufferLayout(layoutPtr);
        bufferCopyView["buffer"] = WebGPU.getJsObject(
          HEAPU32[(((ptr)+(16))>>2)]);
        return bufferCopyView;
      },
  makePassTimestampWrites:(ptr) => {
        if (ptr === 0) return undefined;
        return {
          "querySet": WebGPU.getJsObject(
            HEAPU32[(((ptr)+(4))>>2)]),
          "beginningOfPassWriteIndex": HEAPU32[(((ptr)+(8))>>2)],
          "endOfPassWriteIndex": HEAPU32[(((ptr)+(12))>>2)],
        };
      },
  makePipelineConstants:(constantCount, constantsPtr) => {
        if (!constantCount) return;
        var constants = {};
        for (var i = 0; i < constantCount; ++i) {
          var entryPtr = constantsPtr + 24 * i;
          var key = WebGPU.makeStringFromStringView(entryPtr + 4);
          constants[key] = HEAPF64[(((entryPtr)+(16))>>3)];
        }
        return constants;
      },
  makePipelineLayout:(layoutPtr) => {
        if (!layoutPtr) return 'auto';
        return WebGPU.getJsObject(layoutPtr);
      },
  makeComputeState:(ptr) => {
        if (!ptr) return undefined;
        
        var desc = {
          "module": WebGPU.getJsObject(
            HEAPU32[(((ptr)+(4))>>2)]),
          "constants": WebGPU.makePipelineConstants(
            HEAPU32[(((ptr)+(16))>>2)],
            HEAPU32[(((ptr)+(20))>>2)]),
          "entryPoint": WebGPU.makeStringFromOptionalStringView(
            ptr + 8),
        };
        return desc;
      },
  makeComputePipelineDesc:(descriptor) => {
        
  
        var desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
          "layout": WebGPU.makePipelineLayout(
            HEAPU32[(((descriptor)+(12))>>2)]),
          "compute": WebGPU.makeComputeState(
            descriptor + 16),
        };
        return desc;
      },
  makeRenderPipelineDesc:(descriptor) => {
        
  
        function makePrimitiveState(psPtr) {
          if (!psPtr) return undefined;
          
          return {
            "topology": WebGPU.PrimitiveTopology[HEAP32[(((psPtr)+(4))>>2)]],
            "stripIndexFormat": WebGPU.IndexFormat[HEAP32[(((psPtr)+(8))>>2)]],
            "frontFace": WebGPU.FrontFace[HEAP32[(((psPtr)+(12))>>2)]],
            "cullMode": WebGPU.CullMode[HEAP32[(((psPtr)+(16))>>2)]],
            "unclippedDepth": !!(HEAPU32[(((psPtr)+(20))>>2)]),
          };
        }
  
        function makeBlendComponent(bdPtr) {
          if (!bdPtr) return undefined;
          return {
            "operation": WebGPU.BlendOperation[HEAP32[((bdPtr)>>2)]],
            "srcFactor": WebGPU.BlendFactor[HEAP32[(((bdPtr)+(4))>>2)]],
            "dstFactor": WebGPU.BlendFactor[HEAP32[(((bdPtr)+(8))>>2)]],
          };
        }
  
        function makeBlendState(bsPtr) {
          if (!bsPtr) return undefined;
          return {
            "alpha": makeBlendComponent(bsPtr + 12),
            "color": makeBlendComponent(bsPtr + 0),
          };
        }
  
        function makeColorState(csPtr) {
          
          var format = WebGPU.TextureFormat[HEAP32[(((csPtr)+(4))>>2)]];
          return format ? {
            "format": format,
            "blend": makeBlendState(HEAPU32[(((csPtr)+(8))>>2)]),
            "writeMask": HEAPU32[(((csPtr)+(16))>>2)],
          } : undefined;
        }
  
        function makeColorStates(count, csArrayPtr) {
          var states = [];
          for (var i = 0; i < count; ++i) {
            states.push(makeColorState(csArrayPtr + 24 * i));
          }
          return states;
        }
  
        function makeStencilStateFace(ssfPtr) {
          
          return {
            "compare": WebGPU.CompareFunction[HEAP32[((ssfPtr)>>2)]],
            "failOp": WebGPU.StencilOperation[HEAP32[(((ssfPtr)+(4))>>2)]],
            "depthFailOp": WebGPU.StencilOperation[HEAP32[(((ssfPtr)+(8))>>2)]],
            "passOp": WebGPU.StencilOperation[HEAP32[(((ssfPtr)+(12))>>2)]],
          };
        }
  
        function makeDepthStencilState(dssPtr) {
          if (!dssPtr) return undefined;
  
          
          return {
            "format": WebGPU.TextureFormat[HEAP32[(((dssPtr)+(4))>>2)]],
            "depthWriteEnabled": !!(HEAPU32[(((dssPtr)+(8))>>2)]),
            "depthCompare": WebGPU.CompareFunction[HEAP32[(((dssPtr)+(12))>>2)]],
            "stencilFront": makeStencilStateFace(dssPtr + 16),
            "stencilBack": makeStencilStateFace(dssPtr + 32),
            "stencilReadMask": HEAPU32[(((dssPtr)+(48))>>2)],
            "stencilWriteMask": HEAPU32[(((dssPtr)+(52))>>2)],
            "depthBias": HEAP32[(((dssPtr)+(56))>>2)],
            "depthBiasSlopeScale": HEAPF32[(((dssPtr)+(60))>>2)],
            "depthBiasClamp": HEAPF32[(((dssPtr)+(64))>>2)],
          };
        }
  
        function makeVertexAttribute(vaPtr) {
          
          return {
            "format": WebGPU.VertexFormat[HEAP32[(((vaPtr)+(4))>>2)]],
            "offset": readI53FromI64((vaPtr)+(8)),
            "shaderLocation": HEAPU32[(((vaPtr)+(16))>>2)],
          };
        }
  
        function makeVertexAttributes(count, vaArrayPtr) {
          var vas = [];
          for (var i = 0; i < count; ++i) {
            vas.push(makeVertexAttribute(vaArrayPtr + i * 24));
          }
          return vas;
        }
  
        function makeVertexBuffer(vbPtr) {
          if (!vbPtr) return undefined;
          var stepMode = WebGPU.VertexStepMode[HEAP32[(((vbPtr)+(4))>>2)]];
          var attributeCount = HEAPU32[(((vbPtr)+(16))>>2)];
          if (!stepMode && !attributeCount) {
            return null;
          }
          return {
            "arrayStride": readI53FromI64((vbPtr)+(8)),
            "stepMode": stepMode,
            "attributes": makeVertexAttributes(
              attributeCount,
              HEAPU32[(((vbPtr)+(20))>>2)]),
          };
        }
  
        function makeVertexBuffers(count, vbArrayPtr) {
          if (!count) return undefined;
  
          var vbs = [];
          for (var i = 0; i < count; ++i) {
            vbs.push(makeVertexBuffer(vbArrayPtr + i * 24));
          }
          return vbs;
        }
  
        function makeVertexState(viPtr) {
          if (!viPtr) return undefined;
          
          var desc = {
            "module": WebGPU.getJsObject(
              HEAPU32[(((viPtr)+(4))>>2)]),
            "constants": WebGPU.makePipelineConstants(
              HEAPU32[(((viPtr)+(16))>>2)],
              HEAPU32[(((viPtr)+(20))>>2)]),
            "buffers": makeVertexBuffers(
              HEAPU32[(((viPtr)+(24))>>2)],
              HEAPU32[(((viPtr)+(28))>>2)]),
            "entryPoint": WebGPU.makeStringFromOptionalStringView(
              viPtr + 8),
            };
          return desc;
        }
  
        function makeMultisampleState(msPtr) {
          if (!msPtr) return undefined;
          
          return {
            "count": HEAPU32[(((msPtr)+(4))>>2)],
            "mask": HEAPU32[(((msPtr)+(8))>>2)],
            "alphaToCoverageEnabled": !!(HEAPU32[(((msPtr)+(12))>>2)]),
          };
        }
  
        function makeFragmentState(fsPtr) {
          if (!fsPtr) return undefined;
          
          var desc = {
            "module": WebGPU.getJsObject(
              HEAPU32[(((fsPtr)+(4))>>2)]),
            "constants": WebGPU.makePipelineConstants(
              HEAPU32[(((fsPtr)+(16))>>2)],
              HEAPU32[(((fsPtr)+(20))>>2)]),
            "targets": makeColorStates(
              HEAPU32[(((fsPtr)+(24))>>2)],
              HEAPU32[(((fsPtr)+(28))>>2)]),
            "entryPoint": WebGPU.makeStringFromOptionalStringView(
              fsPtr + 8),
            };
          return desc;
        }
  
        var desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
          "layout": WebGPU.makePipelineLayout(
            HEAPU32[(((descriptor)+(12))>>2)]),
          "vertex": makeVertexState(
            descriptor + 16),
          "primitive": makePrimitiveState(
            descriptor + 48),
          "depthStencil": makeDepthStencilState(
            HEAPU32[(((descriptor)+(72))>>2)]),
          "multisample": makeMultisampleState(
            descriptor + 76),
          "fragment": makeFragmentState(
            HEAPU32[(((descriptor)+(92))>>2)]),
        };
        return desc;
      },
  fillLimitStruct:(limits, limitsOutPtr) => {
        
        var nextInChainPtr = HEAPU32[((limitsOutPtr)>>2)];
  
        function setLimitValueU32(name, basePtr, limitOffset, fallbackValue = 0) {
          var limitValue = limits[name] ?? fallbackValue;
          HEAPU32[(((basePtr)+(limitOffset))>>2)] = limitValue;
        }
        function setLimitValueU64(name, basePtr, limitOffset, fallbackValue = 0) {
          var limitValue = limits[name] ?? fallbackValue;
          // Limits are integer-valued JS `Number`s, so they fit in 'i53'.
          writeI53ToI64((basePtr)+(limitOffset), limitValue);
        }
  
        setLimitValueU32('maxTextureDimension1D',                     limitsOutPtr, 4);
        setLimitValueU32('maxTextureDimension2D',                     limitsOutPtr, 8);
        setLimitValueU32('maxTextureDimension3D',                     limitsOutPtr, 12);
        setLimitValueU32('maxTextureArrayLayers',                     limitsOutPtr, 16);
        setLimitValueU32('maxBindGroups',                             limitsOutPtr, 20);
        setLimitValueU32('maxBindGroupsPlusVertexBuffers',            limitsOutPtr, 24);
        setLimitValueU32('maxBindingsPerBindGroup',                   limitsOutPtr, 28);
        setLimitValueU32('maxDynamicUniformBuffersPerPipelineLayout', limitsOutPtr, 32);
        setLimitValueU32('maxDynamicStorageBuffersPerPipelineLayout', limitsOutPtr, 36);
        setLimitValueU32('maxSampledTexturesPerShaderStage',          limitsOutPtr, 40);
        setLimitValueU32('maxSamplersPerShaderStage',                 limitsOutPtr, 44);
        setLimitValueU32('maxStorageBuffersPerShaderStage',           limitsOutPtr, 48);
        setLimitValueU32('maxStorageTexturesPerShaderStage',          limitsOutPtr, 52);
        setLimitValueU32('maxUniformBuffersPerShaderStage',           limitsOutPtr, 56);
        setLimitValueU32('minUniformBufferOffsetAlignment',           limitsOutPtr, 80);
        setLimitValueU32('minStorageBufferOffsetAlignment',           limitsOutPtr, 84);
        setLimitValueU64('maxUniformBufferBindingSize',               limitsOutPtr, 64);
        setLimitValueU64('maxStorageBufferBindingSize',               limitsOutPtr, 72);
        setLimitValueU32('maxVertexBuffers',                          limitsOutPtr, 88);
        setLimitValueU64('maxBufferSize',                             limitsOutPtr, 96);
        setLimitValueU32('maxVertexAttributes',                       limitsOutPtr, 104);
        setLimitValueU32('maxVertexBufferArrayStride',                limitsOutPtr, 108);
        setLimitValueU32('maxInterStageShaderVariables',              limitsOutPtr, 112);
        setLimitValueU32('maxColorAttachments',                       limitsOutPtr, 116);
        setLimitValueU32('maxColorAttachmentBytesPerSample',          limitsOutPtr, 120);
        setLimitValueU32('maxComputeWorkgroupStorageSize',            limitsOutPtr, 124);
        setLimitValueU32('maxComputeInvocationsPerWorkgroup',         limitsOutPtr, 128);
        setLimitValueU32('maxComputeWorkgroupSizeX',                  limitsOutPtr, 132);
        setLimitValueU32('maxComputeWorkgroupSizeY',                  limitsOutPtr, 136);
        setLimitValueU32('maxComputeWorkgroupSizeZ',                  limitsOutPtr, 140);
        setLimitValueU32('maxComputeWorkgroupsPerDimension',          limitsOutPtr, 144);
        // Note this limit is new and won't be present in all browsers for a while. Fall back to 0.
        setLimitValueU32('maxImmediateSize',                          limitsOutPtr, 148);
  
        if (nextInChainPtr !== 0) {
          var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
          var compatibilityModeLimitsPtr = nextInChainPtr;
          
  
          // Note these limits are new and won't be present in all browsers for a while. Fall back to exposing the PerShaderStage limit.
          setLimitValueU32('maxStorageBuffersInVertexStage',    compatibilityModeLimitsPtr, 8,    limits.maxStorageBuffersPerShaderStage);
          setLimitValueU32('maxStorageBuffersInFragmentStage',  compatibilityModeLimitsPtr, 16,  limits.maxStorageBuffersPerShaderStage);
          setLimitValueU32('maxStorageTexturesInVertexStage',   compatibilityModeLimitsPtr, 12,   limits.maxStorageTexturesPerShaderStage);
          setLimitValueU32('maxStorageTexturesInFragmentStage', compatibilityModeLimitsPtr, 20, limits.maxStorageTexturesPerShaderStage);
        }
      },
  fillAdapterInfoStruct:(info, infoStruct) => {
        
  
        // Populate subgroup limits.
        HEAPU32[(((infoStruct)+(52))>>2)] = info.subgroupMinSize;
        HEAPU32[(((infoStruct)+(56))>>2)] = info.subgroupMaxSize;
  
        // Append all the strings together to condense into a single malloc.
        var strs = info.vendor + info.architecture + info.device + info.description;
        var strPtr = stringToNewUTF8(strs);
  
        var vendorLen = lengthBytesUTF8(info.vendor);
        WebGPU.setStringView(infoStruct + 4, strPtr, vendorLen);
        strPtr += vendorLen;
  
        var architectureLen = lengthBytesUTF8(info.architecture);
        WebGPU.setStringView(infoStruct + 12, strPtr, architectureLen);
        strPtr += architectureLen;
  
        var deviceLen = lengthBytesUTF8(info.device);
        WebGPU.setStringView(infoStruct + 20, strPtr, deviceLen);
        strPtr += deviceLen;
  
        var descriptionLen = lengthBytesUTF8(info.description);
        WebGPU.setStringView(infoStruct + 28, strPtr, descriptionLen);
        strPtr += descriptionLen;
  
        HEAP32[(((infoStruct)+(36))>>2)] = 2;
        var adapterType = info.isFallbackAdapter ? 3 : 4;
        HEAP32[(((infoStruct)+(40))>>2)] = adapterType;
        HEAPU32[(((infoStruct)+(44))>>2)] = 0;
        HEAPU32[(((infoStruct)+(48))>>2)] = 0;
      },
  AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],
  BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1-alpha","one-minus-src1-alpha"],
  BlendOperation:[,"add","subtract","reverse-subtract","min","max"],
  BufferBindingType:[,,"uniform","storage","read-only-storage"],
  BufferMapState:[,"unmapped","pending","mapped"],
  CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],
  CompilationInfoRequestStatus:[,"success","callback-cancelled"],
  ComponentSwizzle:[,"0","1","r","g","b","a"],
  CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],
  CullMode:[,"none","front","back"],
  ErrorFilter:[,"validation","out-of-memory","internal"],
  FeatureLevel:[,"compatibility","core"],
  FeatureName:{
  1:"core-features-and-limits",
  2:"depth-clip-control",
  3:"depth32float-stencil8",
  4:"texture-compression-bc",
  5:"texture-compression-bc-sliced-3d",
  6:"texture-compression-etc2",
  7:"texture-compression-astc",
  8:"texture-compression-astc-sliced-3d",
  9:"timestamp-query",
  10:"indirect-first-instance",
  11:"shader-f16",
  12:"rg11b10ufloat-renderable",
  13:"bgra8unorm-storage",
  14:"float32-filterable",
  15:"float32-blendable",
  16:"clip-distances",
  17:"dual-source-blending",
  18:"subgroups",
  19:"texture-formats-tier1",
  20:"texture-formats-tier2",
  21:"primitive-index",
  22:"texture-component-swizzle",
  23:"subgroup-size-control",
  327692:"chromium-experimental-unorm16-texture-formats",
  327729:"chromium-experimental-multi-draw-indirect",
  },
  FilterMode:[,"nearest","linear"],
  FrontFace:[,"ccw","cw"],
  IndexFormat:[,"uint16","uint32"],
  InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],
  LoadOp:[,"load","clear"],
  MipmapFilterMode:[,"nearest","linear"],
  OptionalBool:["false","true",],
  PowerPreference:[,"low-power","high-performance"],
  PredefinedColorSpace:[,"srgb","display-p3"],
  PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],
  QueryType:[,"occlusion","timestamp"],
  SamplerBindingType:[,,"filtering","non-filtering","comparison"],
  Status:[,"success","error"],
  StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],
  StorageTextureAccess:[,,"write-only","read-only","read-write"],
  StoreOp:[,"store","discard"],
  SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],
  TextureAspect:[,"all","stencil-only","depth-only"],
  TextureDimension:[,"1d","2d","3d"],
  TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],
  TextureSampleType:[,,"float","unfilterable-float","depth","sint","uint"],
  TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],
  ToneMappingMode:[,"standard","extended"],
  VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra","snorm10-10-10-2"],
  VertexStepMode:[,"vertex","instance"],
  WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access","uniform_buffer_standard_layout","subgroup_id","texture_and_sampler_let","subgroup_uniformity","texture_formats_tier1","linear_indexing","immediate_address_space"],
  };
  
  var emwgpuStringToInt_DeviceLostReason = {
              'undefined': 1,  // For older browsers
              'unknown': 1,
              'destroyed': 2,
          };
  
  
  
  
  function _emwgpuAdapterRequestDevice(adapterPtr, futureId, deviceLostFutureId, devicePtr, queuePtr, descriptor) {
    futureId = bigintToI53Checked(futureId);
    deviceLostFutureId = bigintToI53Checked(deviceLostFutureId);
  
  
      var adapter = WebGPU.getJsObject(adapterPtr);
  
      var desc = {};
      if (descriptor) {
        
        var requiredFeatureCount = HEAPU32[(((descriptor)+(12))>>2)];
        if (requiredFeatureCount) {
          var requiredFeaturesPtr = HEAPU32[(((descriptor)+(16))>>2)];
          // requiredFeaturesPtr is a pointer to an array of FeatureName which is an enum of size uint32_t
          desc["requiredFeatures"] = Array.from(HEAPU32.subarray((((requiredFeaturesPtr)>>2)), ((requiredFeaturesPtr + requiredFeatureCount * 4)>>2)),
            (feature) => WebGPU.FeatureName[feature]);
        }
        var limitsPtr = HEAPU32[(((descriptor)+(20))>>2)];
        if (limitsPtr) {
          
          var nextInChainPtr = HEAPU32[((limitsPtr)>>2)];
          var requiredLimits = {};
          function setLimitU32IfDefined(name, basePtr, limitOffset, ignoreIfZero = false) {
            var ptr = basePtr + limitOffset;
            var value = HEAPU32[((ptr)>>2)];
            if (value != 4294967295 && (!ignoreIfZero || value != 0)) {
              requiredLimits[name] = value;
            }
          }
          function setLimitU64IfDefined(name, basePtr, limitOffset) {
            var ptr = basePtr + limitOffset;
            // Handle WGPU_LIMIT_U64_UNDEFINED.
            var limitPart1 = HEAPU32[((ptr)>>2)];
            var limitPart2 = HEAPU32[(((ptr)+(4))>>2)];
            if (limitPart1 != 0xFFFFFFFF || limitPart2 != 0xFFFFFFFF) {
              requiredLimits[name] = readI53FromI64(ptr);
            }
          }
  
          setLimitU32IfDefined("maxTextureDimension1D",                     limitsPtr, 4);
          setLimitU32IfDefined("maxTextureDimension2D",                     limitsPtr, 8);
          setLimitU32IfDefined("maxTextureDimension3D",                     limitsPtr, 12);
          setLimitU32IfDefined("maxTextureArrayLayers",                     limitsPtr, 16);
          setLimitU32IfDefined("maxBindGroups",                             limitsPtr, 20);
          setLimitU32IfDefined('maxBindGroupsPlusVertexBuffers',            limitsPtr, 24);
          setLimitU32IfDefined('maxBindingsPerBindGroup',                   limitsPtr, 28);
          setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout", limitsPtr, 32);
          setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout", limitsPtr, 36);
          setLimitU32IfDefined("maxSampledTexturesPerShaderStage",          limitsPtr, 40);
          setLimitU32IfDefined("maxSamplersPerShaderStage",                 limitsPtr, 44);
          setLimitU32IfDefined("maxStorageBuffersPerShaderStage",           limitsPtr, 48);
          setLimitU32IfDefined("maxStorageTexturesPerShaderStage",          limitsPtr, 52);
          setLimitU32IfDefined("maxUniformBuffersPerShaderStage",           limitsPtr, 56);
          setLimitU32IfDefined("minUniformBufferOffsetAlignment",           limitsPtr, 80);
          setLimitU32IfDefined("minStorageBufferOffsetAlignment",           limitsPtr, 84);
          setLimitU64IfDefined("maxUniformBufferBindingSize",               limitsPtr, 64);
          setLimitU64IfDefined("maxStorageBufferBindingSize",               limitsPtr, 72);
          setLimitU32IfDefined("maxVertexBuffers",                          limitsPtr, 88);
          setLimitU64IfDefined("maxBufferSize",                             limitsPtr, 96);
          setLimitU32IfDefined("maxVertexAttributes",                       limitsPtr, 104);
          setLimitU32IfDefined("maxVertexBufferArrayStride",                limitsPtr, 108);
          setLimitU32IfDefined("maxInterStageShaderVariables",              limitsPtr, 112);
          setLimitU32IfDefined("maxColorAttachments",                       limitsPtr, 116);
          setLimitU32IfDefined("maxColorAttachmentBytesPerSample",          limitsPtr, 120);
          setLimitU32IfDefined("maxComputeWorkgroupStorageSize",            limitsPtr, 124);
          setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",         limitsPtr, 128);
          setLimitU32IfDefined("maxComputeWorkgroupSizeX",                  limitsPtr, 132);
          setLimitU32IfDefined("maxComputeWorkgroupSizeY",                  limitsPtr, 136);
          setLimitU32IfDefined("maxComputeWorkgroupSizeZ",                  limitsPtr, 140);
          setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",          limitsPtr, 144);
          // Not present in all browsers. If the app requested 0, avoid passing it through so it won't cause an error.
          setLimitU32IfDefined("maxImmediateSize",                          limitsPtr, 148, true);
  
          if (nextInChainPtr !== 0) {
            var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
            var compatibilityModeLimitsPtr = nextInChainPtr;
            
            // If not present in the browser, don't request these, otherwise they'll cause an error.
            // (Technically, if any of these is higher than the PerShaderStage equivalent, we should
            // raise the PerShaderStage limit instead, but that's complex and apps should be able to
            // deal with that themselves.)
            if ('maxStorageBuffersInVertexStage' in GPUSupportedLimits.prototype) {
              setLimitU32IfDefined('maxStorageBuffersInVertexStage',    compatibilityModeLimitsPtr, 8);
              setLimitU32IfDefined('maxStorageTexturesInVertexStage',   compatibilityModeLimitsPtr, 12);
              setLimitU32IfDefined('maxStorageBuffersInFragmentStage',  compatibilityModeLimitsPtr, 16);
              setLimitU32IfDefined('maxStorageTexturesInFragmentStage', compatibilityModeLimitsPtr, 20);
            }
          }
  
          desc["requiredLimits"] = requiredLimits;
        }
  
        var defaultQueuePtr = HEAPU32[(((descriptor)+(24))>>2)];
        if (defaultQueuePtr) {
          var defaultQueueDesc = {
            "label": WebGPU.makeStringFromOptionalStringView(
              defaultQueuePtr + 4),
          };
          desc["defaultQueue"] = defaultQueueDesc;
        }
        desc["label"] = WebGPU.makeStringFromOptionalStringView(
          descriptor + 4
        );
      }
  
       // requestDevice
      WebGPU.Internals.futureInsert(futureId, adapter.requestDevice(desc).then((device) => {
         // requestDevice fulfilled
        callUserCallback(() => {
          WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);
          WebGPU.Internals.jsObjectInsert(devicePtr, device);
  
          
  
          // Set up device lost promise resolution.
          // Don't keepalive here, because this isn't guaranteed to ever happen.
          WebGPU.Internals.futureInsert(deviceLostFutureId, device.lost.then((info) => {
            // If the runtime has exited, avoid calling callUserCallback as it
            // will print an error (e.g. if the device got freed during shutdown).
            callUserCallback(() => {
              // Unset the uncaptured error handler.
              device.onuncapturederror = (ev) => {};
              var sp = stackSave();
              var messagePtr = stringToUTF8OnStack(info.message);
              _emwgpuOnDeviceLostCompleted(deviceLostFutureId, emwgpuStringToInt_DeviceLostReason[info.reason],
                messagePtr);
              stackRestore(sp);
            });
          }));
  
          // Set up uncaptured error handlers.
          device.onuncapturederror = (ev) => {
              var type = 5;
              if (ev.error instanceof GPUValidationError) type = 2;
              else if (ev.error instanceof GPUOutOfMemoryError) type = 3;
              else if (ev.error instanceof GPUInternalError) type = 4;
              var sp = stackSave();
              var messagePtr = stringToUTF8OnStack(ev.error.message);
              _emwgpuOnUncapturedError(devicePtr, type, messagePtr);
              stackRestore(sp);
          };
  
          _emwgpuOnRequestDeviceCompleted(futureId, 1,
            devicePtr, 0);
        });
      }, (ex) => {
         // requestDevice rejected
        callUserCallback(() => {
          var sp = stackSave();
          var messagePtr = stringToUTF8OnStack(ex.message);
          _emwgpuOnRequestDeviceCompleted(futureId, 3,
            devicePtr, messagePtr);
          if (deviceLostFutureId) {
            _emwgpuOnDeviceLostCompleted(deviceLostFutureId, 4,
              messagePtr);
          }
          stackRestore(sp);
        });
      }));
    ;
  }

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };
  
  
  
  
  var _emwgpuBufferGetConstMappedRange = (bufferPtr, offset, size) => {
      var buffer = WebGPU.getJsObject(bufferPtr);
  
      if (size == -1) size = undefined;
  
      var mapped;
      try {
        mapped = buffer.getMappedRange(offset, size);
      } catch (ex) {
        return 0;
      }
      var data = _memalign(16, mapped.byteLength);
      HEAPU8.set(new Uint8Array(mapped), data);
      WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(() => _free(data));
      return data;
    };

  
  
  
  
  var _emwgpuBufferMapAsync = function(bufferPtr, futureId, mode, offset, size) {
    futureId = bigintToI53Checked(futureId);
    mode = bigintToI53Checked(mode);
  
  
      var buffer = WebGPU.getJsObject(bufferPtr);
      WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];
  
      if (size == -1) size = undefined;
  
       // mapAsync
      WebGPU.Internals.futureInsert(futureId, buffer.mapAsync(mode, offset, size).then(() => {
         // mapAsync fulfilled
        callUserCallback(() => {
          _emwgpuOnMapAsyncCompleted(futureId, 1,
            0);
        });
      }, (ex) => {
         // mapAsync rejected
        callUserCallback(() => {
          var sp = stackSave();
          var messagePtr = stringToUTF8OnStack(ex.message);
          var status =
            ex.name === 'AbortError' ? 4 :
            ex.name === 'OperationError' ? 3 :
            0;
          
          _emwgpuOnMapAsyncCompleted(futureId, status, messagePtr);
          delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];
        });
      }));
    ;
  };

  
  var _emwgpuBufferUnmap = (bufferPtr) => {
      var buffer = WebGPU.getJsObject(bufferPtr);
  
      var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];
      if (!onUnmap) {
        // Already unmapped
        return;
      }
  
      for (var i = 0; i < onUnmap.length; ++i) {
        onUnmap[i]();
      }
      delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]
  
      buffer.unmap();
    };

  
  var _emwgpuDelete = (ptr) => {
      delete WebGPU.Internals.jsObjects[ptr];
    };

  
  var _emwgpuDeviceCreateBuffer = (devicePtr, descriptor, bufferPtr) => {
      
  
      var mappedAtCreation = !!(HEAPU32[(((descriptor)+(32))>>2)]);
  
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "usage": HEAPU32[(((descriptor)+(16))>>2)],
        "size": readI53FromI64((descriptor)+(24)),
        "mappedAtCreation": mappedAtCreation,
      };
  
      var device = WebGPU.getJsObject(devicePtr);
      var buffer;
      try {
        buffer = device.createBuffer(desc);
      } catch (ex) {
        // The only exception should be RangeError if mapping at creation ran out of memory.
        
        
        return false;
      }
      WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);
      if (mappedAtCreation) {
        WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];
      }
      return true;
    };

  
  var _emwgpuDeviceCreateShaderModule = (devicePtr, descriptor, shaderModulePtr) => {
      
      var nextInChainPtr = HEAPU32[((descriptor)>>2)];
      var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
  
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "code": "",
      };
  
      switch (sType) {
        case 2: {
          desc["code"] = WebGPU.makeStringFromStringView(
            nextInChainPtr + 8
          );
          break;
        }
      }
  
      var device = WebGPU.getJsObject(devicePtr);
      WebGPU.Internals.jsObjectInsert(shaderModulePtr, device.createShaderModule(desc));
    };

  
  var _emwgpuDeviceDestroy = (devicePtr) => {
      const device = WebGPU.getJsObject(devicePtr);
      // Remove the onuncapturederror handler which holds a pointer to the WGPUDevice.
      device.onuncapturederror = null;
      device.destroy()
    };

  
  var emwgpuStringToInt_PreferredFormat = {
              'rgba8unorm': 22,
              'bgra8unorm': 27,
          };
  
  
  var _emwgpuGetPreferredFormat = () => {
      var format = navigator.gpu.getPreferredCanvasFormat();
      return emwgpuStringToInt_PreferredFormat[format];
    };

  
  
  
  
  function _emwgpuInstanceRequestAdapter(instancePtr, futureId, options, adapterPtr) {
    futureId = bigintToI53Checked(futureId);
  
  
      var opts;
      if (options) {
        
        opts = {
          "featureLevel": WebGPU.FeatureLevel[HEAP32[(((options)+(4))>>2)]],
          "powerPreference": WebGPU.PowerPreference[HEAP32[(((options)+(8))>>2)]],
          "forceFallbackAdapter":
            !!(HEAPU32[(((options)+(12))>>2)]),
        };
  
        var nextInChainPtr = HEAPU32[((options)>>2)];
        if (nextInChainPtr !== 0) {
          var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
          var webxrOptions = nextInChainPtr;
          
          opts.xrCompatible = !!(HEAPU32[(((webxrOptions)+(8))>>2)]);
        }
      }
  
      if (!('gpu' in navigator)) {
        var sp = stackSave();
        var messagePtr = stringToUTF8OnStack('WebGPU not available on this browser (navigator.gpu is not available)');
        _emwgpuOnRequestAdapterCompleted(futureId, 3,
          adapterPtr, messagePtr);
        stackRestore(sp);
        return;
      }
  
       // requestAdapter
      WebGPU.Internals.futureInsert(futureId, navigator.gpu.requestAdapter(opts).then((adapter) => {
         // requestAdapter fulfilled
        callUserCallback(() => {
          if (adapter) {
            WebGPU.Internals.jsObjectInsert(adapterPtr, adapter);
            _emwgpuOnRequestAdapterCompleted(futureId, 1,
              adapterPtr, 0);
          } else {
            var sp = stackSave();
            var messagePtr = stringToUTF8OnStack('WebGPU not available on this browser (requestAdapter returned null)');
            _emwgpuOnRequestAdapterCompleted(futureId, 3,
              adapterPtr, messagePtr);
            stackRestore(sp);
          }
        });
      }, (ex) => {
         // requestAdapter rejected
        callUserCallback(() => {
          var sp = stackSave();
          var messagePtr = stringToUTF8OnStack(ex.message);
          _emwgpuOnRequestAdapterCompleted(futureId, 4,
            adapterPtr, messagePtr);
          stackRestore(sp);
        });
      }));
    ;
  }

  
  var _emwgpuWaitAny = (futurePtr, futureCount, timeoutMSPtr) => Asyncify.handleAsync(async () => {
      var promises = [];
      if (timeoutMSPtr) {
        var timeoutMS = HEAP32[((timeoutMSPtr)>>2)];
        promises.length = futureCount + 1;
        promises[futureCount] = new Promise((resolve) => setTimeout(resolve, timeoutMS, 0));
      } else {
        promises.length = futureCount;
      }
  
      for (var i = 0; i < futureCount; ++i) {
        // If any FutureID is not tracked, it means it must be done.
        var futureId = readI53FromI64((futurePtr + i * 8));
        if (!(futureId in WebGPU.Internals.futures)) {
          return futureId;
        }
        promises[i] = WebGPU.Internals.futures[futureId];
      }
  
      const firstResolvedFuture = await Promise.race(promises);
      delete WebGPU.Internals.futures[firstResolvedFuture];
      return firstResolvedFuture;
    });
  _emwgpuWaitAny.isAsync = true;

  var ENV = {
  };
  
  var getExecutableName = () => thisProgram || './this.program';
  var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        // Default values.
        // Browser language detection #8751
        var lang = (globalThis.navigator?.language ?? 'C').replace('-', '_') + '.UTF-8';
        var env = {
          'USER': 'web_user',
          'LOGNAME': 'web_user',
          'PATH': '/',
          'PWD': '/',
          'HOME': '/home/web_user',
          'LANG': lang,
          '_': getExecutableName()
        };
        // Apply the user-provided values, if any.
        for (var x in ENV) {
          // x is a key in ENV; if ENV[x] is undefined, that means it was
          // explicitly set to be so. We allow user code to do that to
          // force variables with default values to remain unset.
          if (ENV[x] === undefined) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(`${x}=${env[x]}`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
  
  var _environ_get = (__environ, environ_buf) => {
      var bufSize = 0;
      var envp = 0;
      for (var string of getEnvStrings()) {
        var ptr = environ_buf + bufSize;
        HEAPU32[(((__environ)+(envp))>>2)] = ptr;
        bufSize += stringToUTF8(string, ptr, Infinity) + 1;
        envp += 4;
      }
      return 0;
    };

  
  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
      var strings = getEnvStrings();
      HEAPU32[((penviron_count)>>2)] = strings.length;
      var bufSize = 0;
      for (var string of strings) {
        bufSize += lengthBytesUTF8(string) + 1;
      }
      HEAPU32[((penviron_buf_size)>>2)] = bufSize;
      return 0;
    };


  var initRandomFill = () => {
      // This block is not needed on v19+ since crypto.getRandomValues is builtin
      if (ENVIRONMENT_IS_NODE) {
        var nodeCrypto = require('node:crypto');
        return (view) => nodeCrypto.randomFillSync(view);
      }
  
      return (view) => (crypto.getRandomValues(view), 0);
    };
  var randomFill = (view) => (randomFill = initRandomFill())(view);
  var _random_get = (buffer, size) => randomFill(HEAPU8.subarray(buffer, buffer + size));

  
  var _wgpuAdapterGetInfo = (adapterPtr, info) => {
      var adapter = WebGPU.getJsObject(adapterPtr);
      WebGPU.fillAdapterInfoStruct(adapter.info, info);
      return 1;
    };

  
  
  var _wgpuCommandEncoderBeginRenderPass = (encoderPtr, descriptor) => {
      
  
      function makeColorAttachment(caPtr) {
        var viewPtr = HEAPU32[(((caPtr)+(4))>>2)];
        if (viewPtr === 0) {
          // Null `view` means no attachment in this slot.
          return undefined;
        }
  
        var depthSlice = HEAPU32[(((caPtr)+(8))>>2)];
        if (depthSlice == 0xFFFFFFFF) depthSlice = undefined;
  
        return {
          "view": WebGPU.getJsObject(viewPtr),
          "depthSlice": depthSlice,
          "resolveTarget": WebGPU.getJsObject(
            HEAPU32[(((caPtr)+(12))>>2)]),
          "clearValue": WebGPU.makeColor(caPtr + 24),
          "loadOp": WebGPU.LoadOp[HEAP32[(((caPtr)+(16))>>2)]],
          "storeOp": WebGPU.StoreOp[HEAP32[(((caPtr)+(20))>>2)]],
        };
      }
  
      function makeColorAttachments(count, caPtr) {
        var attachments = [];
        for (var i = 0; i < count; ++i) {
          attachments.push(makeColorAttachment(caPtr + 56 * i));
        }
        return attachments;
      }
  
      function makeDepthStencilAttachment(dsaPtr) {
        if (dsaPtr === 0) return undefined;
  
        return {
          "view": WebGPU.getJsObject(
            HEAPU32[(((dsaPtr)+(4))>>2)]),
          "depthClearValue": HEAPF32[(((dsaPtr)+(16))>>2)],
          "depthLoadOp": WebGPU.LoadOp[HEAP32[(((dsaPtr)+(8))>>2)]],
          "depthStoreOp": WebGPU.StoreOp[HEAP32[(((dsaPtr)+(12))>>2)]],
          "depthReadOnly": !!(HEAPU32[(((dsaPtr)+(20))>>2)]),
          "stencilClearValue": HEAPU32[(((dsaPtr)+(32))>>2)],
          "stencilLoadOp": WebGPU.LoadOp[HEAP32[(((dsaPtr)+(24))>>2)]],
          "stencilStoreOp": WebGPU.StoreOp[HEAP32[(((dsaPtr)+(28))>>2)]],
          "stencilReadOnly": !!(HEAPU32[(((dsaPtr)+(36))>>2)]),
        };
      }
  
      function makeRenderPassDescriptor(descriptor) {
        
        var nextInChainPtr = HEAPU32[((descriptor)>>2)];
  
        var maxDrawCount = undefined;
        if (nextInChainPtr !== 0) {
          var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
          var renderPassMaxDrawCount = nextInChainPtr;
          
          // Note: The user could have passed a really huge value here, which is technically valid in
          // C but will not be allowed by WebGPU in JS because of [EnforceRange]. We intentionally
          // ignore that case because it's not useful - apps can just pick a smaller maxDrawCount.
          maxDrawCount = readI53FromI64((renderPassMaxDrawCount)+(8));
        }
  
        var desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
          "colorAttachments": makeColorAttachments(
            HEAPU32[(((descriptor)+(12))>>2)],
            HEAPU32[(((descriptor)+(16))>>2)]),
          "depthStencilAttachment": makeDepthStencilAttachment(
            HEAPU32[(((descriptor)+(20))>>2)]),
          "occlusionQuerySet": WebGPU.getJsObject(
            HEAPU32[(((descriptor)+(24))>>2)]),
          "timestampWrites": WebGPU.makePassTimestampWrites(
            HEAPU32[(((descriptor)+(28))>>2)]),
          "maxDrawCount": maxDrawCount,
        };
        return desc;
      }
  
      var desc = makeRenderPassDescriptor(descriptor);
  
      var commandEncoder = WebGPU.getJsObject(encoderPtr);
      var ptr = _emwgpuCreateRenderPassEncoder(0);
      WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.beginRenderPass(desc));
      return ptr;
    };

  
  var _wgpuCommandEncoderCopyTextureToBuffer = (encoderPtr, srcPtr, dstPtr, copySizePtr) => {
      var commandEncoder = WebGPU.getJsObject(encoderPtr);
      var copySize = WebGPU.makeExtent3D(copySizePtr);
      commandEncoder.copyTextureToBuffer(
        WebGPU.makeTexelCopyTextureInfo(srcPtr), WebGPU.makeTexelCopyBufferInfo(dstPtr), copySize);
    };

  
  
  var _wgpuCommandEncoderFinish = (encoderPtr, descriptor) => {
      // TODO: Use the descriptor.
      var commandEncoder = WebGPU.getJsObject(encoderPtr);
      var ptr = _emwgpuCreateCommandBuffer(0);
      WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.finish());
      return ptr;
    };

  
  
  var _wgpuDeviceCreateBindGroup = (devicePtr, descriptor) => {
      
  
      function makeEntry(entryPtr) {
        
  
        var bufferPtr = HEAPU32[(((entryPtr)+(8))>>2)];
        var samplerPtr = HEAPU32[(((entryPtr)+(32))>>2)];
        var textureViewPtr = HEAPU32[(((entryPtr)+(36))>>2)];
        var externalTexturePtr = 0;
        WebGPU.iterateExtensions(entryPtr, {
          14: (ptr) => {
            externalTexturePtr = HEAPU32[(((ptr)+(8))>>2)];
          },
        });
  
        var resource;
        if (bufferPtr) {
          // Note the sentinel UINT64_MAX will be read as -1.
          var size = readI53FromI64((entryPtr)+(24));
          if (size == -1) size = undefined;
  
          resource = {
            "buffer": WebGPU.getJsObject(bufferPtr),
            "offset": readI53FromI64((entryPtr)+(16)),
            "size": size,
          };
        } else {
          resource = WebGPU.getJsObject(samplerPtr || textureViewPtr || externalTexturePtr);
        }
        return {
          "binding": HEAPU32[(((entryPtr)+(4))>>2)],
          "resource": resource,
        };
      }
  
      function makeEntries(count, entriesPtrs) {
        var entries = [];
        for (var i = 0; i < count; ++i) {
          entries.push(makeEntry(entriesPtrs +
              40 * i));
        }
        return entries;
      }
  
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "layout": WebGPU.getJsObject(
          HEAPU32[(((descriptor)+(12))>>2)]),
        "entries": makeEntries(
          HEAPU32[(((descriptor)+(16))>>2)],
          HEAPU32[(((descriptor)+(20))>>2)]
        ),
      };
  
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateBindGroup(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroup(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreateBindGroupLayout = (devicePtr, descriptor) => {
      
  
      function makeBufferEntry(substructPtr) {
        var typeInt =
          HEAPU32[(((substructPtr)+(4))>>2)];
        if (!typeInt) return undefined;
  
        return {
          "type": WebGPU.BufferBindingType[typeInt],
          "hasDynamicOffset":
            !!(HEAPU32[(((substructPtr)+(8))>>2)]),
          "minBindingSize":
            readI53FromI64((substructPtr)+(16)),
        };
      }
  
      function makeSamplerEntry(substructPtr) {
        var typeInt =
          HEAPU32[(((substructPtr)+(4))>>2)];
        if (!typeInt) return undefined;
  
        return {
          "type": WebGPU.SamplerBindingType[typeInt],
        };
      }
  
      function makeTextureEntry(substructPtr) {
        var sampleTypeInt =
          HEAPU32[(((substructPtr)+(4))>>2)];
        if (!sampleTypeInt) return undefined;
  
        return {
          "sampleType": WebGPU.TextureSampleType[sampleTypeInt],
          "viewDimension": WebGPU.TextureViewDimension[HEAP32[(((substructPtr)+(8))>>2)]],
          "multisampled":
            !!(HEAPU32[(((substructPtr)+(12))>>2)]),
        };
      }
  
      function makeStorageTextureEntry(substructPtr) {
        var accessInt =
          HEAPU32[(((substructPtr)+(4))>>2)]
        if (!accessInt) return undefined;
  
        return {
          "access": WebGPU.StorageTextureAccess[accessInt],
          "format": WebGPU.TextureFormat[HEAP32[(((substructPtr)+(8))>>2)]],
          "viewDimension": WebGPU.TextureViewDimension[HEAP32[(((substructPtr)+(12))>>2)]],
        };
      }
  
      function makeEntry(entryPtr) {
        
  
        var entry = {
          "binding":
            HEAPU32[(((entryPtr)+(4))>>2)],
          "visibility":
            HEAPU32[(((entryPtr)+(8))>>2)],
          "buffer": makeBufferEntry(entryPtr + 24),
          "sampler": makeSamplerEntry(entryPtr + 48),
          "texture": makeTextureEntry(entryPtr + 56),
          "storageTexture": makeStorageTextureEntry(entryPtr + 72),
        };
        WebGPU.iterateExtensions(entryPtr, {
          13: (ptr) => {
            entry["externalTexture"] = {};
          },
        });
        return entry;
      }
  
      function makeEntries(count, entriesPtrs) {
        var entries = [];
        for (var i = 0; i < count; ++i) {
          entries.push(makeEntry(entriesPtrs +
              88 * i));
        }
        return entries;
      }
  
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "entries": makeEntries(
          HEAPU32[(((descriptor)+(12))>>2)],
          HEAPU32[(((descriptor)+(16))>>2)]
        ),
      };
  
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateBindGroupLayout(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroupLayout(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreateCommandEncoder = (devicePtr, descriptor) => {
      var desc;
      if (descriptor) {
        
        desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
        };
      }
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateCommandEncoder(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createCommandEncoder(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreatePipelineLayout = (devicePtr, descriptor) => {
      
      var bglCount = HEAPU32[(((descriptor)+(12))>>2)];
      var bglPtr = HEAPU32[(((descriptor)+(16))>>2)];
      var bgls = [];
      for (var i = 0; i < bglCount; ++i) {
        bgls.push(WebGPU.getJsObject(
          HEAPU32[(((bglPtr)+(4 * i))>>2)]));
      }
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "bindGroupLayouts": bgls,
        "immediateSize": HEAPU32[(((descriptor)+(20))>>2)],
      };
  
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreatePipelineLayout(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createPipelineLayout(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreateRenderPipeline = (devicePtr, descriptor) => {
      var desc = WebGPU.makeRenderPipelineDesc(descriptor);
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateRenderPipeline(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createRenderPipeline(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreateSampler = (devicePtr, descriptor) => {
      var desc;
      if (descriptor) {
        
  
        desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
          "addressModeU": WebGPU.AddressMode[HEAP32[(((descriptor)+(12))>>2)]],
          "addressModeV": WebGPU.AddressMode[HEAP32[(((descriptor)+(16))>>2)]],
          "addressModeW": WebGPU.AddressMode[HEAP32[(((descriptor)+(20))>>2)]],
          "magFilter": WebGPU.FilterMode[HEAP32[(((descriptor)+(24))>>2)]],
          "minFilter": WebGPU.FilterMode[HEAP32[(((descriptor)+(28))>>2)]],
          "mipmapFilter": WebGPU.MipmapFilterMode[HEAP32[(((descriptor)+(32))>>2)]],
          "lodMinClamp": HEAPF32[(((descriptor)+(36))>>2)],
          "lodMaxClamp": HEAPF32[(((descriptor)+(40))>>2)],
          "compare": WebGPU.CompareFunction[HEAP32[(((descriptor)+(44))>>2)]],
          "maxAnisotropy": HEAPU16[(((descriptor)+(48))>>1)],
        };
      }
  
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateSampler(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createSampler(desc));
      return ptr;
    };

  
  
  var _wgpuDeviceCreateTexture = (devicePtr, descriptor) => {
      
      var nextInChainPtr = HEAPU32[((descriptor)>>2)];
  
      var textureBindingViewDimension;
      if (nextInChainPtr !== 0) {
        var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
        var textureBindingViewDimensionDescriptor = nextInChainPtr;
        
        textureBindingViewDimension = WebGPU.TextureViewDimension[HEAP32[(((textureBindingViewDimensionDescriptor)+(8))>>2)]];
      }
  
      var desc = {
        "label": WebGPU.makeStringFromOptionalStringView(
          descriptor + 4),
        "size": WebGPU.makeExtent3D(descriptor + 28),
        "mipLevelCount": HEAPU32[(((descriptor)+(44))>>2)],
        "sampleCount": HEAPU32[(((descriptor)+(48))>>2)],
        "dimension": WebGPU.TextureDimension[HEAP32[(((descriptor)+(24))>>2)]],
        "format": WebGPU.TextureFormat[HEAP32[(((descriptor)+(40))>>2)]],
        "usage": HEAPU32[(((descriptor)+(16))>>2)],
        "textureBindingViewDimension": textureBindingViewDimension,
      };
  
      var viewFormatCount = HEAPU32[(((descriptor)+(52))>>2)];
      if (viewFormatCount) {
        var viewFormatsPtr = HEAPU32[(((descriptor)+(56))>>2)];
        // viewFormatsPtr pointer to an array of TextureFormat which is an enum of size uint32_t
        desc['viewFormats'] = Array.from(HEAP32.subarray((((viewFormatsPtr)>>2)), ((viewFormatsPtr + viewFormatCount * 4)>>2)),
          format => WebGPU.TextureFormat[format]);
      }
  
      var device = WebGPU.getJsObject(devicePtr);
      var ptr = _emwgpuCreateTexture(0);
      WebGPU.Internals.jsObjectInsert(ptr, device.createTexture(desc));
      return ptr;
    };

  var findCanvasEventTarget = findEventTarget;
  
  
  
  var _wgpuInstanceCreateSurface = (instancePtr, descriptor) => {
      
      var nextInChainPtr = HEAPU32[((descriptor)>>2)];
      var sourceCanvasHTMLSelector = nextInChainPtr;
  
      
      var selectorPtr = HEAPU32[(((sourceCanvasHTMLSelector)+(8))>>2)];
      
      var canvas = findCanvasEventTarget(selectorPtr);
      var context = canvas.getContext('webgpu');
      if (!context) return 0;
  
      context.surfaceLabelWebGPU = WebGPU.makeStringFromOptionalStringView(
        descriptor + 4
      );
  
      var ptr = _emwgpuCreateSurface(0);
      WebGPU.Internals.jsObjectInsert(ptr, context);
      return ptr;
    };

  
  var _wgpuQueueSubmit = (queuePtr, commandCount, commands) => {
      var queue = WebGPU.getJsObject(queuePtr);
      var cmds = Array.from(HEAP32.subarray((((commands)>>2)), ((commands + commandCount * 4)>>2)),
        (id) => WebGPU.getJsObject(id));
      queue.submit(cmds);
    };

  
  
  function _wgpuQueueWriteBuffer(queuePtr, bufferPtr, bufferOffset, data, size) {
    bufferOffset = bigintToI53Checked(bufferOffset);
  
  
      var queue = WebGPU.getJsObject(queuePtr);
      var buffer = WebGPU.getJsObject(bufferPtr);
      // There is a size limitation for ArrayBufferView. Work around by passing in a subarray
      // instead of the whole heap. crbug.com/1201109
      var subarray = HEAPU8.subarray(data, data + size);
      queue.writeBuffer(buffer, bufferOffset, subarray, 0, size);
    ;
  }

  
  var _wgpuQueueWriteTexture = (queuePtr, destinationPtr, data, dataSize, dataLayoutPtr, writeSizePtr) => {
      var queue = WebGPU.getJsObject(queuePtr);
  
      var destination = WebGPU.makeTexelCopyTextureInfo(destinationPtr);
      var dataLayout = WebGPU.makeTexelCopyBufferLayout(dataLayoutPtr);
      var writeSize = WebGPU.makeExtent3D(writeSizePtr);
      // This subarray isn't strictly necessary, but helps work around an issue
      // where Chromium makes a copy of the entire heap. crbug.com/1134457
      var subarray = HEAPU8.subarray(data, data + dataSize);
      queue.writeTexture(destination, subarray, dataLayout, writeSize);
    };

  
  var _wgpuRenderPassEncoderDraw = (passPtr, vertexCount, instanceCount, firstVertex, firstInstance) => {
      
      
      firstVertex >>>= 0;
      firstInstance >>>= 0;
      var pass = WebGPU.getJsObject(passPtr);
      pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    };

  
  var _wgpuRenderPassEncoderDrawIndexed = (passPtr, indexCount, instanceCount, firstIndex, baseVertex, firstInstance) => {
      
      
      firstIndex >>>= 0;
      firstInstance >>>= 0;
      var pass = WebGPU.getJsObject(passPtr);
      pass.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
    };

  
  var _wgpuRenderPassEncoderEnd = (encoderPtr) => {
      var encoder = WebGPU.getJsObject(encoderPtr);
      encoder.end();
    };

  
  var _wgpuRenderPassEncoderSetBindGroup = (passPtr, groupIndex, groupPtr, dynamicOffsetCount, dynamicOffsetsPtr) => {
      
      var pass = WebGPU.getJsObject(passPtr);
      var group = WebGPU.getJsObject(groupPtr);
      if (dynamicOffsetCount == 0) {
        pass.setBindGroup(groupIndex, group);
      } else {
        pass.setBindGroup(groupIndex, group, HEAPU32, ((dynamicOffsetsPtr)>>2), dynamicOffsetCount);
      }
    };

  
  
  function _wgpuRenderPassEncoderSetIndexBuffer(passPtr, bufferPtr, format, offset, size) {
    offset = bigintToI53Checked(offset);
    size = bigintToI53Checked(size);
  
  
      var pass = WebGPU.getJsObject(passPtr);
      var buffer = WebGPU.getJsObject(bufferPtr);
      if (size == -1) size = undefined;
      pass.setIndexBuffer(buffer, WebGPU.IndexFormat[format], offset, size);
    ;
  }

  
  var _wgpuRenderPassEncoderSetPipeline = (passPtr, pipelinePtr) => {
      var pass = WebGPU.getJsObject(passPtr);
      var pipeline = WebGPU.getJsObject(pipelinePtr);
      pass.setPipeline(pipeline);
    };

  
  
  function _wgpuRenderPassEncoderSetVertexBuffer(passPtr, slot, bufferPtr, offset, size) {
    offset = bigintToI53Checked(offset);
    size = bigintToI53Checked(size);
  
  
      
      var pass = WebGPU.getJsObject(passPtr);
      var buffer = WebGPU.getJsObject(bufferPtr);
      if (size == -1) size = undefined;
      pass.setVertexBuffer(slot, buffer, offset, size);
    ;
  }

  
  var _wgpuSurfaceConfigure = (surfacePtr, config) => {
      
      var context = WebGPU.getJsObject(surfacePtr);
  
      var canvasSize = [
        HEAPU32[(((config)+(24))>>2)],
        HEAPU32[(((config)+(28))>>2)]
      ];
  
      if (canvasSize[0] !== 0) {
        context["canvas"]["width"] = canvasSize[0];
      }
  
      if (canvasSize[1] !== 0) {
        context["canvas"]["height"] = canvasSize[1];
      }
  
      var configuration = {
        "device": WebGPU.getJsObject(HEAPU32[(((config)+(4))>>2)]),
        "format": WebGPU.TextureFormat[HEAP32[(((config)+(8))>>2)]],
        "usage": HEAPU32[(((config)+(16))>>2)],
        "alphaMode": WebGPU.CompositeAlphaMode[HEAP32[(((config)+(40))>>2)]],
      };
  
      var viewFormatCount = HEAPU32[(((config)+(32))>>2)];
      if (viewFormatCount) {
        var viewFormatsPtr = HEAPU32[(((config)+(36))>>2)];
        // viewFormatsPtr pointer to an array of TextureFormat which is an enum of size uint32_t
        configuration['viewFormats'] = Array.from(HEAP32.subarray((((viewFormatsPtr)>>2)), ((viewFormatsPtr + viewFormatCount * 4)>>2)),
          format => WebGPU.TextureFormat[format]);
      }
  
      {
        var nextInChainPtr = HEAPU32[((config)>>2)];
  
        if (nextInChainPtr !== 0) {
          var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
          var surfaceColorManagement = nextInChainPtr;
          
          configuration.colorSpace = WebGPU.PredefinedColorSpace[HEAP32[(((surfaceColorManagement)+(8))>>2)]];
          configuration.toneMapping = {
            mode: WebGPU.ToneMappingMode[HEAP32[(((surfaceColorManagement)+(12))>>2)]],
          };
        }
      }
  
      context.configure(configuration);
    };

  
  
  var _wgpuSurfaceGetCurrentTexture = (surfacePtr, surfaceTexturePtr) => {
      
      var context = WebGPU.getJsObject(surfacePtr);
  
      try {
        var texturePtr = _emwgpuCreateTexture(0);
        WebGPU.Internals.jsObjectInsert(texturePtr, context.getCurrentTexture());
        HEAPU32[(((surfaceTexturePtr)+(4))>>2)] = texturePtr;
        HEAP32[(((surfaceTexturePtr)+(8))>>2)] = 1;
      } catch (ex) {
        HEAPU32[(((surfaceTexturePtr)+(4))>>2)] = 0;
        HEAP32[(((surfaceTexturePtr)+(8))>>2)] = 6;
      }
    };

  
  var _wgpuSurfaceUnconfigure = (surfacePtr) => {
      var context = WebGPU.getJsObject(surfacePtr);
      context.unconfigure();
    };

  
  
  var _wgpuTextureCreateView = (texturePtr, descriptor) => {
      var desc;
      if (descriptor) {
        var swizzle;
        var nextInChainPtr = HEAPU32[((descriptor)>>2)];
        if (nextInChainPtr !== 0) {
          var sType = HEAP32[(((nextInChainPtr)+(4))>>2)];
          var swizzleDescriptor = nextInChainPtr;
          
          var swizzlePtr = swizzleDescriptor + 8;
          var r = WebGPU.ComponentSwizzle[HEAP32[((swizzlePtr)>>2)]] || 'r';
          var g = WebGPU.ComponentSwizzle[HEAP32[(((swizzlePtr)+(4))>>2)]] || 'g';
          var b = WebGPU.ComponentSwizzle[HEAP32[(((swizzlePtr)+(8))>>2)]] || 'b';
          var a = WebGPU.ComponentSwizzle[HEAP32[(((swizzlePtr)+(12))>>2)]] || 'a';
          swizzle = `${r}${g}${b}${a}`;
        }
  
        var mipLevelCount = HEAPU32[(((descriptor)+(24))>>2)];
        var arrayLayerCount = HEAPU32[(((descriptor)+(32))>>2)];
        desc = {
          "label": WebGPU.makeStringFromOptionalStringView(
            descriptor + 4),
          "format": WebGPU.TextureFormat[HEAP32[(((descriptor)+(12))>>2)]],
          "dimension": WebGPU.TextureViewDimension[HEAP32[(((descriptor)+(16))>>2)]],
          "baseMipLevel": HEAPU32[(((descriptor)+(20))>>2)],
          "mipLevelCount": mipLevelCount === 4294967295 ? undefined : mipLevelCount,
          "baseArrayLayer": HEAPU32[(((descriptor)+(28))>>2)],
          "arrayLayerCount": arrayLayerCount === 4294967295 ? undefined : arrayLayerCount,
          "aspect": WebGPU.TextureAspect[HEAP32[(((descriptor)+(36))>>2)]],
          "usage": HEAPU32[(((descriptor)+(40))>>2)],
          "swizzle": swizzle,
        };
      }
  
      var texture = WebGPU.getJsObject(texturePtr);
      var ptr = _emwgpuCreateTextureView(0);
      WebGPU.Internals.jsObjectInsert(ptr, texture.createView(desc));
      return ptr;
    };

  
  var _wgpuTextureDestroy = (texturePtr) => {
      WebGPU.getJsObject(texturePtr).destroy();
    };




  var wasmTableMirror = [];
  
  
  var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        /** @suppress {checkTypes} */
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      return func;
    };

  var runAndAbortIfError = (func) => {
      try {
        return func();
      } catch (e) {
        abort(e);
      }
    };
  
  
  var runtimeKeepalivePush = () => {
      runtimeKeepaliveCounter += 1;
    };
  
  var runtimeKeepalivePop = () => {
      runtimeKeepaliveCounter -= 1;
    };
  
  
  var Asyncify = {
  instrumentWasmImports(imports) {
        var importPattern = /^(invoke_.*|__asyncjs__.*)$/;
  
        for (let [x, original] of Object.entries(imports)) {
          if (typeof original == 'function') {
            let isAsyncifyImport = original.isAsync || importPattern.test(x);
          }
        }
      },
  instrumentFunction(original) {
        var wrapper = (...args) => {
          Asyncify.exportCallStack.push(original);
          try {
            return original(...args);
          } finally {
            if (!ABORT) {
              var top = Asyncify.exportCallStack.pop();
              Asyncify.maybeStopUnwind();
            }
          }
        };
        Asyncify.funcWrappers.set(original, wrapper);
        return wrapper;
      },
  instrumentWasmExports(exports) {
        var ret = {};
        for (let [x, original] of Object.entries(exports)) {
          if (typeof original == 'function') {
            var wrapper = Asyncify.instrumentFunction(original);
            ret[x] = wrapper;
          } else {
            ret[x] = original;
          }
        }
        return ret;
      },
  State:{
  Normal:0,
  Unwinding:1,
  Rewinding:2,
  Disabled:3,
  },
  state:0,
  StackSize:1048576,
  currData:null,
  handleSleepReturnValue:0,
  exportCallStack:[],
  callstackFuncToId:new Map,
  callStackIdToFunc:new Map,
  funcWrappers:new Map,
  callStackId:0,
  asyncPromiseHandlers:null,
  sleepCallbacks:[],
  getCallStackId(func) {
        if (!Asyncify.callstackFuncToId.has(func)) {
          var id = Asyncify.callStackId++;
          Asyncify.callstackFuncToId.set(func, id);
          Asyncify.callStackIdToFunc.set(id, func);
        }
        return Asyncify.callstackFuncToId.get(func);
      },
  maybeStopUnwind() {
        if (Asyncify.currData &&
            Asyncify.state === Asyncify.State.Unwinding &&
            Asyncify.exportCallStack.length === 0) {
          // We just finished unwinding.
          // Be sure to set the state before calling any other functions to avoid
          // possible infinite recursion here (For example in debug pthread builds
          // the dbg() function itself can call back into WebAssembly to get the
          // current pthread_self() pointer).
          Asyncify.state = Asyncify.State.Normal;
          
          // Keep the runtime alive so that a re-wind can be done later.
          runAndAbortIfError(_asyncify_stop_unwind);
          if (typeof Fibers != 'undefined') {
            Fibers.trampoline();
          }
        }
      },
  whenDone() {
        return new Promise((resolve, reject) => {
          Asyncify.asyncPromiseHandlers = { resolve, reject };
        });
      },
  allocateData() {
        // An asyncify data structure has three fields:
        //  0  current stack pos
        //  4  max stack pos
        //  8  id of function at bottom of the call stack (callStackIdToFunc[id] == wasm func)
        //
        // The Asyncify ABI only interprets the first two fields, the rest is for the runtime.
        // We also embed a stack in the same memory region here, right next to the structure.
        // This struct is also defined as asyncify_data_t in emscripten/fiber.h
        var ptr = _malloc(12 + Asyncify.StackSize);
        Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
        Asyncify.setDataRewindFunc(ptr);
        return ptr;
      },
  setDataHeader(ptr, stack, stackSize) {
        HEAPU32[((ptr)>>2)] = stack;
        HEAPU32[(((ptr)+(4))>>2)] = stack + stackSize;
      },
  setDataRewindFunc(ptr) {
        var bottomOfCallStack = Asyncify.exportCallStack[0];
        var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
        HEAP32[(((ptr)+(8))>>2)] = rewindId;
      },
  getDataRewindFunc(ptr) {
        var id = HEAP32[(((ptr)+(8))>>2)];
        var func = Asyncify.callStackIdToFunc.get(id);
        return func;
      },
  doRewind(ptr) {
        var original = Asyncify.getDataRewindFunc(ptr);
        var func = Asyncify.funcWrappers.get(original);
        // Once we have rewound and the stack we no longer need to artificially
        // keep the runtime alive.
        
        return callUserCallback(func);
      },
  handleSleep(startAsync) {
        if (ABORT) return;
        if (Asyncify.state === Asyncify.State.Normal) {
          // Prepare to sleep. Call startAsync, and see what happens:
          // if the code decided to call our callback synchronously,
          // then no async operation was in fact begun, and we don't
          // need to do anything.
          var reachedCallback = false;
          var reachedAfterCallback = false;
          startAsync((handleSleepReturnValue = 0) => {
            if (ABORT) return;
            Asyncify.handleSleepReturnValue = handleSleepReturnValue;
            reachedCallback = true;
            if (!reachedAfterCallback) {
              // We are happening synchronously, so no need for async.
              return;
            }
            Asyncify.state = Asyncify.State.Rewinding;
            runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));
            if (typeof MainLoop != 'undefined' && MainLoop.func) {
              MainLoop.resume();
            }
            var asyncWasmReturnValue, isError = false;
            try {
              asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);
            } catch (err) {
              asyncWasmReturnValue = err;
              isError = true;
            }
            // Track whether the return value was handled by any promise handlers.
            var handled = false;
            if (!Asyncify.currData) {
              // All asynchronous execution has finished.
              // `asyncWasmReturnValue` now contains the final
              // return value of the exported async WASM function.
              //
              // Note: `asyncWasmReturnValue` is distinct from
              // `Asyncify.handleSleepReturnValue`.
              // `Asyncify.handleSleepReturnValue` contains the return
              // value of the last C function to have executed
              // `Asyncify.handleSleep()`, whereas `asyncWasmReturnValue`
              // contains the return value of the exported WASM function
              // that may have called C functions that
              // call `Asyncify.handleSleep()`.
              var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
              if (asyncPromiseHandlers) {
                Asyncify.asyncPromiseHandlers = null;
                (isError ? asyncPromiseHandlers.reject : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
                handled = true;
              }
            }
            if (isError && !handled) {
              // If there was an error and it was not handled by now, we have no choice but to
              // rethrow that error into the global scope where it can be caught only by
              // `onerror` or `onunhandledpromiserejection`.
              throw asyncWasmReturnValue;
            }
          });
          reachedAfterCallback = true;
          if (!reachedCallback) {
            // A true async operation was begun; start a sleep.
            Asyncify.state = Asyncify.State.Unwinding;
            // TODO: reuse, don't alloc/free every sleep
            Asyncify.currData = Asyncify.allocateData();
            if (typeof MainLoop != 'undefined' && MainLoop.func) {
              MainLoop.pause();
            }
            runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData));
          }
        } else if (Asyncify.state === Asyncify.State.Rewinding) {
          // Stop a resume.
          Asyncify.state = Asyncify.State.Normal;
          runAndAbortIfError(_asyncify_stop_rewind);
          _free(Asyncify.currData);
          Asyncify.currData = null;
          // Call all sleep callbacks now that the sleep-resume is all done.
          Asyncify.sleepCallbacks.forEach(callUserCallback);
        } else {
          abort(`invalid state: ${Asyncify.state}`);
        }
        return Asyncify.handleSleepReturnValue;
      },
  handleAsync:(startAsync) => Asyncify.handleSleep(async (wakeUp) => {
        // TODO: add error handling as a second param when handleSleep implements it.
        wakeUp(await startAsync());
      }),
  };

      Module['requestAnimationFrame'] = MainLoop.requestAnimationFrame;
      Module['pauseMainLoop'] = MainLoop.pause;
      Module['resumeMainLoop'] = MainLoop.resume;
      MainLoop.init();;
// End JS library code

// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.

{

  // Begin ATMODULES hooks
  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];
if (Module['print']) out = Module['print'];
if (Module['printErr']) err = Module['printErr'];
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
  // End ATMODULES hooks

  if (Module['arguments']) arguments_ = Module['arguments'];
  if (Module['thisProgram']) thisProgram = Module['thisProgram'];

  if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
      Module['preInit'].shift()();
    }
  }
}

// Begin runtime exports
  // End runtime exports
  // Begin JS library exports
  // End JS library exports

// end include: postlibrary.js

var ASM_CONSTS = {
  245248: ($0, $1, $2, $3, $4) => { const record = {}; record.kind = 'building-hit'; record.time = new Date().toISOString(); record.step = UTF8ToString($0); record.part = $1; record.oldDamage = $2; record.shotDamage = $3; record.status = $4; const payload = JSON.stringify(record); localStorage.setItem('mc2-last-building-hit', payload); if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') navigator.sendBeacon('/__mc2_diag', new Blob([payload], {type: 'application/json'})); },  
 245716: ($0, $1) => { if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return; const record = {}; record.kind = 'targeting'; record.time = new Date().toISOString(); record.stage = UTF8ToString($0); record.part = $1; localStorage.setItem('mc2-last-target-stage', JSON.stringify(record)); navigator.sendBeacon('/__mc2_diag', new Blob([JSON.stringify(record)], {type:'application/json'})); },  
 246112: ($0, $1, $2, $3) => { const record = {}; record.kind = 'weapon-hit'; record.time = new Date().toISOString(); record.stage = UTF8ToString($0); record.targetClass = $1; record.targetPart = $2; record.damage = $3; const payload = JSON.stringify(record); localStorage.setItem('mc2-last-weapon-stage', payload); if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') navigator.sendBeacon('/__mc2_diag', new Blob([payload], {type: 'application/json'})); },  
 246563: ($0) => { var text = UTF8ToString($0); var stack = ""; try { stack = new Error().stack || ""; } catch (e) {} if (typeof window !== "undefined" && window.mc2RecordFault) window.mc2RecordFault("engine stop", text, stack); else if (typeof console !== "undefined") console.error("[GameOS STOP] " + text); }
};
function __asyncjs__mc2v_open(data,size,out) { return Asyncify.handleAsync(async () => { const bytes = HEAPU8.slice(data, data + size); const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })); const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v); const loaded = await new Promise(resolve => { v.onloadeddata = () => resolve(true); v.onerror = () => resolve(false); setTimeout(() => resolve(false), 15000); v.src = url; }); if (!loaded || !v.videoWidth || !v.videoHeight) { v.remove(); URL.revokeObjectURL(url); return 0; } let audio = null; try { const ctx = new OfflineAudioContext(1, 1, 48000); audio = await ctx.decodeAudioData(bytes.buffer.slice(0)); } catch (e) { audio = null; } const w = v.videoWidth, h = v.videoHeight; const canvas = new OffscreenCanvas(w, h); const g = canvas.getContext('2d', { willReadFrequently: true }); const M = (Module.mc2Video ||= { next: 1, movies: {} }); const id = M.next++; M.movies[id] = { v, url, canvas, g, audio, lastTime: -1, started: false }; HEAP32[(out >> 2) + 0] = w; HEAP32[(out >> 2) + 1] = h; HEAP32[(out >> 2) + 2] = audio ? audio.numberOfChannels : 0; HEAP32[(out >> 2) + 3] = audio ? audio.sampleRate : 0; HEAP32[(out >> 2) + 4] = audio ? audio.length : 0; return id; }); }
function mc2v_frame(id,seconds,dst) { const m = Module.mc2Video && Module.mc2Video.movies[id]; if (!m) return 2; const v = m.v; if (!m.started) { m.started = true; v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); } const duration = isFinite(v.duration) ? v.duration : 0; if (!v.seeking && Math.abs(v.currentTime - seconds) > 0.35 && (!duration || seconds < duration)) v.currentTime = seconds; if (v.paused && !v.ended && (!duration || seconds < duration)) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } let result = 0; if (v.readyState >= 2 && v.currentTime !== m.lastTime) { m.lastTime = v.currentTime; const w = m.canvas.width, h = m.canvas.height; m.g.drawImage(v, 0, 0, w, h); const src = new Uint32Array(m.g.getImageData(0, 0, w, h).data.buffer); const out = new Uint32Array(HEAPU8.buffer, dst, w * h); for (let i = 0; i < src.length; i++) { const p = src[i]; out[i] = (p & 0xff00ff00) | ((p & 0xff) << 16) | ((p >>> 16) & 0xff); } result |= 1; } if (v.ended || (duration && seconds >= duration)) result |= 2; return result; }
function mc2v_audio(id,dst,maxSamples) { const m = Module.mc2Video && Module.mc2Video.movies[id]; if (!m || !m.audio) return 0; const a = m.audio, ch = a.numberOfChannels, n = Math.min(a.length, Math.floor(maxSamples / ch)); const out = new Int16Array(HEAPU8.buffer, dst, n * ch); for (let c = 0; c < ch; c++) { const s = a.getChannelData(c); for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, s[i])); out[i * ch + c] = x < 0 ? x * 32768 : x * 32767; } } return n * ch; }
function mc2v_rewind(id) { const m = Module.mc2Video && Module.mc2Video.movies[id]; if (!m) return; m.v.currentTime = 0; m.lastTime = -1; m.started = false; }
function mc2v_close(id) { const M = Module.mc2Video; const m = M && M.movies[id]; if (!m) return; m.v.pause(); m.v.removeAttribute('src'); m.v.load(); m.v.remove(); URL.revokeObjectURL(m.url); delete M.movies[id]; }
function mc2CanvasLeft() { const canvas = document.getElementById('canvas'); return canvas ? canvas.getBoundingClientRect().left : 0; }
function mc2CanvasTop() { const canvas = document.getElementById('canvas'); return canvas ? canvas.getBoundingClientRect().top : 0; }
function mc2PointerLocked() { const canvas = document.getElementById('canvas'); return (canvas && document.pointerLockElement === canvas) ? 1 : 0; }
function mc2_web_audio_open() { try { if (!Module.mc2Audio) { var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return 0; var ctx = new Ctor(); Module.mc2Audio = { ctx: ctx, voices: new Map(), plays: 0, blocked: 0, byChannel: {}, output: null, analyser: null }; try { var an = ctx.createAnalyser(); an.fftSize = 2048; an.connect(ctx.destination); Module.mc2Audio.analyser = an; Module.mc2Audio.output = an; } catch (e) {} } return 1; } catch (e) { return 0; } }
function mc2_web_audio_close() { var a = Module.mc2Audio; if (!a) return; a.voices.forEach(function (v) { try { v.src.stop(); } catch (e) {} }); a.voices.clear(); try { a.ctx.close(); } catch (e) {} Module.mc2Audio = null; }
function mc2_web_audio_resume() { var a = Module.mc2Audio; if (a && a.ctx && a.ctx.state === 'suspended') a.ctx.resume(); }
function mc2_web_audio_play(channel,ptr,bytes,chans,rate,bits,volume,pan,loop) { var a = Module.mc2Audio; if (!a) return; try { if (a.ctx.state === 'suspended') { a.blocked++; a.ctx.resume(); } var frameBytes = (bits >> 3) * chans; var frames = frameBytes ? Math.floor(bytes / frameBytes) : 0; if (frames <= 0) return; var buffer = a.ctx.createBuffer(chans, frames, rate); for (var c = 0; c < chans; ++c) { var out = buffer.getChannelData(c); if (bits === 16) { var base = (ptr >> 1) + c; for (var i = 0; i < frames; ++i) out[i] = HEAP16[base + i * chans] / 32768; } else { var base8 = ptr + c; for (var j = 0; j < frames; ++j) out[j] = (HEAPU8[base8 + j * chans] - 128) / 128; } } var old = a.voices.get(channel); if (old) { try { old.src.stop(); } catch (e) {} } var gain = a.ctx.createGain(); gain.gain.value = volume; var node = gain; var panner = null; if (a.ctx.createStereoPanner) { panner = a.ctx.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); node = panner; } node.connect(a.output || a.ctx.destination); var src = a.ctx.createBufferSource(); src.buffer = buffer; src.loop = !!loop; src.connect(gain); var voice = { src: src, gain: gain, panner: panner, loop: !!loop }; src.onended = function () { if (a.voices.get(channel) === voice) a.voices.delete(channel); }; a.voices.set(channel, voice); src.start(); a.plays++; var peak = 0; for (var pc = 0; pc < chans; ++pc) { var d = buffer.getChannelData(pc); for (var k = 0; k < frames; k += 7) { var v = d[k] < 0 ? -d[k] : d[k]; if (v > peak) peak = v; } } var tally = a.byChannel[channel] || (a.byChannel[channel] = { plays: 0, loudest: 0 }); tally.plays++; if (peak * volume > tally.loudest) tally.loudest = peak * volume; } catch (e) { } }
function mc2_web_audio_stop(channel) { var a = Module.mc2Audio; if (!a) return; var v = a.voices.get(channel); if (!v) return; try { v.src.stop(); } catch (e) {} a.voices.delete(channel); }
function mc2_web_audio_set_volume(channel,volume) { var a = Module.mc2Audio; if (!a) return; var v = a.voices.get(channel); if (v) v.gain.gain.setTargetAtTime(volume, a.ctx.currentTime, 0.01); }
function mc2_web_audio_set_pan(channel,pan) { var a = Module.mc2Audio; if (!a) return; var v = a.voices.get(channel); if (v && v.panner) v.panner.pan.setTargetAtTime(pan, a.ctx.currentTime, 0.01); }
function mc2_web_audio_is_playing(channel) { var a = Module.mc2Audio; return (a && a.voices.has(channel)) ? 1 : 0; }
function mc2_web_audio_plays() { return Module.mc2Audio ? Module.mc2Audio.plays : 0; }
function mc2_web_audio_blocked() { return Module.mc2Audio ? Module.mc2Audio.blocked : 0; }

// Imports from the Wasm binary.
var _malloc,
  _free,
  _mc2_game_cursor_visible,
  _mc2_fx_made,
  _main,
  _mc2_audio_resume,
  _emwgpuCreateBindGroup,
  _emwgpuCreateBindGroupLayout,
  _emwgpuCreateCommandBuffer,
  _emwgpuCreateCommandEncoder,
  _emwgpuCreateComputePassEncoder,
  _emwgpuCreateComputePipeline,
  _emwgpuCreateExternalTexture,
  _emwgpuCreatePipelineLayout,
  _emwgpuCreateQuerySet,
  _emwgpuCreateRenderBundle,
  _emwgpuCreateRenderBundleEncoder,
  _emwgpuCreateRenderPassEncoder,
  _emwgpuCreateRenderPipeline,
  _emwgpuCreateSampler,
  _emwgpuCreateSurface,
  _emwgpuCreateTexture,
  _emwgpuCreateTextureView,
  _emwgpuCreateAdapter,
  _emwgpuImportBuffer,
  _emwgpuCreateDevice,
  _emwgpuCreateQueue,
  _emwgpuCreateShaderModule,
  _emwgpuOnCompilationInfoCompleted,
  _emwgpuOnCreateComputePipelineCompleted,
  _emwgpuOnCreateRenderPipelineCompleted,
  _emwgpuOnDeviceLostCompleted,
  _emwgpuOnMapAsyncCompleted,
  _emwgpuOnPopErrorScopeCompleted,
  _emwgpuOnRequestAdapterCompleted,
  _emwgpuOnRequestDeviceCompleted,
  _emwgpuOnWorkDoneCompleted,
  _emwgpuOnUncapturedError,
  _memalign,
  _setThrew,
  __emscripten_stack_restore,
  __emscripten_stack_alloc,
  _emscripten_stack_get_current,
  __wasmfs_opfs_record_entry,
  dynCall_ii,
  dynCall_vi,
  dynCall_iii,
  dynCall_iiii,
  dynCall_vii,
  dynCall_v,
  dynCall_fi,
  dynCall_viii,
  dynCall_iiiiii,
  dynCall_viiffi,
  dynCall_vif,
  dynCall_viff,
  dynCall_iiiii,
  dynCall_fii,
  dynCall_iiifi,
  dynCall_fiii,
  dynCall_iif,
  dynCall_viif,
  dynCall_viiii,
  dynCall_iifii,
  dynCall_iiiifiiiiii,
  dynCall_iiiiiiii,
  dynCall_iiiiiiiiii,
  dynCall_iiiff,
  dynCall_iiiif,
  dynCall_iiiiiii,
  dynCall_fiiififii,
  dynCall_fiiii,
  dynCall_iiif,
  dynCall_iiifiiiii,
  dynCall_iiiiiifii,
  dynCall_viiiiiii,
  dynCall_iifiii,
  dynCall_i,
  dynCall_viffff,
  dynCall_iifff,
  dynCall_viiiiii,
  dynCall_iiff,
  dynCall_viifiii,
  dynCall_vifffi,
  dynCall_viffi,
  dynCall_iiiid,
  dynCall_viiiffi,
  dynCall_viiiii,
  dynCall_viiifiiiiii,
  dynCall_iid,
  dynCall_jii,
  dynCall_viji,
  dynCall_jiji,
  dynCall_iidiiii,
  dynCall_viijii,
  dynCall_iiiiiiiii,
  dynCall_iiiiij,
  dynCall_iiiiid,
  dynCall_iiiiijj,
  dynCall_iiiiiijj,
  dynCall_ji,
  dynCall_iiiij,
  dynCall_iij,
  _asyncify_start_unwind,
  _asyncify_stop_unwind,
  _asyncify_start_rewind,
  _asyncify_stop_rewind,
  memory,
  __indirect_function_table,
  wasmMemory,
  wasmTable;


function assignWasmExports(wasmExports) {
  _malloc = wasmExports['malloc'];
  _free = wasmExports['free'];
  _mc2_game_cursor_visible = Module['_mc2_game_cursor_visible'] = wasmExports['mc2_game_cursor_visible'];
  _mc2_fx_made = Module['_mc2_fx_made'] = wasmExports['mc2_fx_made'];
  _main = Module['_main'] = wasmExports['__main_argc_argv'];
  _mc2_audio_resume = Module['_mc2_audio_resume'] = wasmExports['mc2_audio_resume'];
  _emwgpuCreateBindGroup = wasmExports['emwgpuCreateBindGroup'];
  _emwgpuCreateBindGroupLayout = wasmExports['emwgpuCreateBindGroupLayout'];
  _emwgpuCreateCommandBuffer = wasmExports['emwgpuCreateCommandBuffer'];
  _emwgpuCreateCommandEncoder = wasmExports['emwgpuCreateCommandEncoder'];
  _emwgpuCreateComputePassEncoder = wasmExports['emwgpuCreateComputePassEncoder'];
  _emwgpuCreateComputePipeline = wasmExports['emwgpuCreateComputePipeline'];
  _emwgpuCreateExternalTexture = wasmExports['emwgpuCreateExternalTexture'];
  _emwgpuCreatePipelineLayout = wasmExports['emwgpuCreatePipelineLayout'];
  _emwgpuCreateQuerySet = wasmExports['emwgpuCreateQuerySet'];
  _emwgpuCreateRenderBundle = wasmExports['emwgpuCreateRenderBundle'];
  _emwgpuCreateRenderBundleEncoder = wasmExports['emwgpuCreateRenderBundleEncoder'];
  _emwgpuCreateRenderPassEncoder = wasmExports['emwgpuCreateRenderPassEncoder'];
  _emwgpuCreateRenderPipeline = wasmExports['emwgpuCreateRenderPipeline'];
  _emwgpuCreateSampler = wasmExports['emwgpuCreateSampler'];
  _emwgpuCreateSurface = wasmExports['emwgpuCreateSurface'];
  _emwgpuCreateTexture = wasmExports['emwgpuCreateTexture'];
  _emwgpuCreateTextureView = wasmExports['emwgpuCreateTextureView'];
  _emwgpuCreateAdapter = wasmExports['emwgpuCreateAdapter'];
  _emwgpuImportBuffer = wasmExports['emwgpuImportBuffer'];
  _emwgpuCreateDevice = wasmExports['emwgpuCreateDevice'];
  _emwgpuCreateQueue = wasmExports['emwgpuCreateQueue'];
  _emwgpuCreateShaderModule = wasmExports['emwgpuCreateShaderModule'];
  _emwgpuOnCompilationInfoCompleted = wasmExports['emwgpuOnCompilationInfoCompleted'];
  _emwgpuOnCreateComputePipelineCompleted = wasmExports['emwgpuOnCreateComputePipelineCompleted'];
  _emwgpuOnCreateRenderPipelineCompleted = wasmExports['emwgpuOnCreateRenderPipelineCompleted'];
  _emwgpuOnDeviceLostCompleted = wasmExports['emwgpuOnDeviceLostCompleted'];
  _emwgpuOnMapAsyncCompleted = wasmExports['emwgpuOnMapAsyncCompleted'];
  _emwgpuOnPopErrorScopeCompleted = wasmExports['emwgpuOnPopErrorScopeCompleted'];
  _emwgpuOnRequestAdapterCompleted = wasmExports['emwgpuOnRequestAdapterCompleted'];
  _emwgpuOnRequestDeviceCompleted = wasmExports['emwgpuOnRequestDeviceCompleted'];
  _emwgpuOnWorkDoneCompleted = wasmExports['emwgpuOnWorkDoneCompleted'];
  _emwgpuOnUncapturedError = wasmExports['emwgpuOnUncapturedError'];
  _memalign = wasmExports['memalign'];
  _setThrew = wasmExports['setThrew'];
  __emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
  __emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  _emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
  __wasmfs_opfs_record_entry = wasmExports['_wasmfs_opfs_record_entry'];
  dynCall_ii = dynCalls['ii'] = wasmExports['dynCall_ii'];
  dynCall_vi = dynCalls['vi'] = wasmExports['dynCall_vi'];
  dynCall_iii = dynCalls['iii'] = wasmExports['dynCall_iii'];
  dynCall_iiii = dynCalls['iiii'] = wasmExports['dynCall_iiii'];
  dynCall_vii = dynCalls['vii'] = wasmExports['dynCall_vii'];
  dynCall_v = dynCalls['v'] = wasmExports['dynCall_v'];
  dynCall_fi = dynCalls['fi'] = wasmExports['dynCall_fi'];
  dynCall_viii = dynCalls['viii'] = wasmExports['dynCall_viii'];
  dynCall_iiiiii = dynCalls['iiiiii'] = wasmExports['dynCall_iiiiii'];
  dynCall_viiffi = dynCalls['viiffi'] = wasmExports['dynCall_viiffi'];
  dynCall_vif = dynCalls['vif'] = wasmExports['dynCall_vif'];
  dynCall_viff = dynCalls['viff'] = wasmExports['dynCall_viff'];
  dynCall_iiiii = dynCalls['iiiii'] = wasmExports['dynCall_iiiii'];
  dynCall_fii = dynCalls['fii'] = wasmExports['dynCall_fii'];
  dynCall_iiifi = dynCalls['iiifi'] = wasmExports['dynCall_iiifi'];
  dynCall_fiii = dynCalls['fiii'] = wasmExports['dynCall_fiii'];
  dynCall_iif = dynCalls['iif'] = wasmExports['dynCall_iif'];
  dynCall_viif = dynCalls['viif'] = wasmExports['dynCall_viif'];
  dynCall_viiii = dynCalls['viiii'] = wasmExports['dynCall_viiii'];
  dynCall_iifii = dynCalls['iifii'] = wasmExports['dynCall_iifii'];
  dynCall_iiiifiiiiii = dynCalls['iiiifiiiiii'] = wasmExports['dynCall_iiiifiiiiii'];
  dynCall_iiiiiiii = dynCalls['iiiiiiii'] = wasmExports['dynCall_iiiiiiii'];
  dynCall_iiiiiiiiii = dynCalls['iiiiiiiiii'] = wasmExports['dynCall_iiiiiiiiii'];
  dynCall_iiiff = dynCalls['iiiff'] = wasmExports['dynCall_iiiff'];
  dynCall_iiiif = dynCalls['iiiif'] = wasmExports['dynCall_iiiif'];
  dynCall_iiiiiii = dynCalls['iiiiiii'] = wasmExports['dynCall_iiiiiii'];
  dynCall_fiiififii = dynCalls['fiiififii'] = wasmExports['dynCall_fiiififii'];
  dynCall_fiiii = dynCalls['fiiii'] = wasmExports['dynCall_fiiii'];
  dynCall_iiif = dynCalls['iiif'] = wasmExports['dynCall_iiif'];
  dynCall_iiifiiiii = dynCalls['iiifiiiii'] = wasmExports['dynCall_iiifiiiii'];
  dynCall_iiiiiifii = dynCalls['iiiiiifii'] = wasmExports['dynCall_iiiiiifii'];
  dynCall_viiiiiii = dynCalls['viiiiiii'] = wasmExports['dynCall_viiiiiii'];
  dynCall_iifiii = dynCalls['iifiii'] = wasmExports['dynCall_iifiii'];
  dynCall_i = dynCalls['i'] = wasmExports['dynCall_i'];
  dynCall_viffff = dynCalls['viffff'] = wasmExports['dynCall_viffff'];
  dynCall_iifff = dynCalls['iifff'] = wasmExports['dynCall_iifff'];
  dynCall_viiiiii = dynCalls['viiiiii'] = wasmExports['dynCall_viiiiii'];
  dynCall_iiff = dynCalls['iiff'] = wasmExports['dynCall_iiff'];
  dynCall_viifiii = dynCalls['viifiii'] = wasmExports['dynCall_viifiii'];
  dynCall_vifffi = dynCalls['vifffi'] = wasmExports['dynCall_vifffi'];
  dynCall_viffi = dynCalls['viffi'] = wasmExports['dynCall_viffi'];
  dynCall_iiiid = dynCalls['iiiid'] = wasmExports['dynCall_iiiid'];
  dynCall_viiiffi = dynCalls['viiiffi'] = wasmExports['dynCall_viiiffi'];
  dynCall_viiiii = dynCalls['viiiii'] = wasmExports['dynCall_viiiii'];
  dynCall_viiifiiiiii = dynCalls['viiifiiiiii'] = wasmExports['dynCall_viiifiiiiii'];
  dynCall_iid = dynCalls['iid'] = wasmExports['dynCall_iid'];
  dynCall_jii = dynCalls['jii'] = wasmExports['dynCall_jii'];
  dynCall_viji = dynCalls['viji'] = wasmExports['dynCall_viji'];
  dynCall_jiji = dynCalls['jiji'] = wasmExports['dynCall_jiji'];
  dynCall_iidiiii = dynCalls['iidiiii'] = wasmExports['dynCall_iidiiii'];
  dynCall_viijii = dynCalls['viijii'] = wasmExports['dynCall_viijii'];
  dynCall_iiiiiiiii = dynCalls['iiiiiiiii'] = wasmExports['dynCall_iiiiiiiii'];
  dynCall_iiiiij = dynCalls['iiiiij'] = wasmExports['dynCall_iiiiij'];
  dynCall_iiiiid = dynCalls['iiiiid'] = wasmExports['dynCall_iiiiid'];
  dynCall_iiiiijj = dynCalls['iiiiijj'] = wasmExports['dynCall_iiiiijj'];
  dynCall_iiiiiijj = dynCalls['iiiiiijj'] = wasmExports['dynCall_iiiiiijj'];
  dynCall_ji = dynCalls['ji'] = wasmExports['dynCall_ji'];
  dynCall_iiiij = dynCalls['iiiij'] = wasmExports['dynCall_iiiij'];
  dynCall_iij = dynCalls['iij'] = wasmExports['dynCall_iij'];
  _asyncify_start_unwind = wasmExports['asyncify_start_unwind'];
  _asyncify_stop_unwind = wasmExports['asyncify_stop_unwind'];
  _asyncify_start_rewind = wasmExports['asyncify_start_rewind'];
  _asyncify_stop_rewind = wasmExports['asyncify_stop_rewind'];
  memory = wasmMemory = wasmExports['memory'];
  __indirect_function_table = wasmTable = wasmExports['__indirect_function_table'];
}

var wasmImports = {
  /** @export */
  __assert_fail: ___assert_fail,
  /** @export */
  __asyncjs__mc2v_open,
  /** @export */
  __cxa_throw: ___cxa_throw,
  /** @export */
  _abort_js: __abort_js,
  /** @export */
  _emscripten_throw_longjmp: __emscripten_throw_longjmp,
  /** @export */
  _localtime_js: __localtime_js,
  /** @export */
  _tzset_js: __tzset_js,
  /** @export */
  _wasmfs_copy_preloaded_file_data: __wasmfs_copy_preloaded_file_data,
  /** @export */
  _wasmfs_get_num_preloaded_dirs: __wasmfs_get_num_preloaded_dirs,
  /** @export */
  _wasmfs_get_num_preloaded_files: __wasmfs_get_num_preloaded_files,
  /** @export */
  _wasmfs_get_preloaded_child_path: __wasmfs_get_preloaded_child_path,
  /** @export */
  _wasmfs_get_preloaded_file_mode: __wasmfs_get_preloaded_file_mode,
  /** @export */
  _wasmfs_get_preloaded_file_size: __wasmfs_get_preloaded_file_size,
  /** @export */
  _wasmfs_get_preloaded_parent_path: __wasmfs_get_preloaded_parent_path,
  /** @export */
  _wasmfs_get_preloaded_path_name: __wasmfs_get_preloaded_path_name,
  /** @export */
  _wasmfs_opfs_close_access: __wasmfs_opfs_close_access,
  /** @export */
  _wasmfs_opfs_close_blob: __wasmfs_opfs_close_blob,
  /** @export */
  _wasmfs_opfs_flush_access: __wasmfs_opfs_flush_access,
  /** @export */
  _wasmfs_opfs_free_directory: __wasmfs_opfs_free_directory,
  /** @export */
  _wasmfs_opfs_free_file: __wasmfs_opfs_free_file,
  /** @export */
  _wasmfs_opfs_get_child: __wasmfs_opfs_get_child,
  /** @export */
  _wasmfs_opfs_get_entries: __wasmfs_opfs_get_entries,
  /** @export */
  _wasmfs_opfs_get_size_access: __wasmfs_opfs_get_size_access,
  /** @export */
  _wasmfs_opfs_get_size_blob: __wasmfs_opfs_get_size_blob,
  /** @export */
  _wasmfs_opfs_get_size_file: __wasmfs_opfs_get_size_file,
  /** @export */
  _wasmfs_opfs_init_root_directory: __wasmfs_opfs_init_root_directory,
  /** @export */
  _wasmfs_opfs_insert_directory: __wasmfs_opfs_insert_directory,
  /** @export */
  _wasmfs_opfs_insert_file: __wasmfs_opfs_insert_file,
  /** @export */
  _wasmfs_opfs_move_file: __wasmfs_opfs_move_file,
  /** @export */
  _wasmfs_opfs_open_access: __wasmfs_opfs_open_access,
  /** @export */
  _wasmfs_opfs_open_blob: __wasmfs_opfs_open_blob,
  /** @export */
  _wasmfs_opfs_read_access: __wasmfs_opfs_read_access,
  /** @export */
  _wasmfs_opfs_read_blob: __wasmfs_opfs_read_blob,
  /** @export */
  _wasmfs_opfs_remove_child: __wasmfs_opfs_remove_child,
  /** @export */
  _wasmfs_opfs_set_size_access: __wasmfs_opfs_set_size_access,
  /** @export */
  _wasmfs_opfs_set_size_file: __wasmfs_opfs_set_size_file,
  /** @export */
  _wasmfs_opfs_write_access: __wasmfs_opfs_write_access,
  /** @export */
  _wasmfs_stdin_get_char: __wasmfs_stdin_get_char,
  /** @export */
  clock_time_get: _clock_time_get,
  /** @export */
  emscripten_asm_const_int: _emscripten_asm_const_int,
  /** @export */
  emscripten_cancel_main_loop: _emscripten_cancel_main_loop,
  /** @export */
  emscripten_clear_interval: _emscripten_clear_interval,
  /** @export */
  emscripten_date_now: _emscripten_date_now,
  /** @export */
  emscripten_err: _emscripten_err,
  /** @export */
  emscripten_get_element_css_size: _emscripten_get_element_css_size,
  /** @export */
  emscripten_get_now: _emscripten_get_now,
  /** @export */
  emscripten_has_asyncify: _emscripten_has_asyncify,
  /** @export */
  emscripten_out: _emscripten_out,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  emscripten_return_address: _emscripten_return_address,
  /** @export */
  emscripten_run_script: _emscripten_run_script,
  /** @export */
  emscripten_set_blur_callback_on_thread: _emscripten_set_blur_callback_on_thread,
  /** @export */
  emscripten_set_keydown_callback_on_thread: _emscripten_set_keydown_callback_on_thread,
  /** @export */
  emscripten_set_keypress_callback_on_thread: _emscripten_set_keypress_callback_on_thread,
  /** @export */
  emscripten_set_keyup_callback_on_thread: _emscripten_set_keyup_callback_on_thread,
  /** @export */
  emscripten_set_main_loop_arg: _emscripten_set_main_loop_arg,
  /** @export */
  emscripten_set_mousedown_callback_on_thread: _emscripten_set_mousedown_callback_on_thread,
  /** @export */
  emscripten_set_mousemove_callback_on_thread: _emscripten_set_mousemove_callback_on_thread,
  /** @export */
  emscripten_set_mouseup_callback_on_thread: _emscripten_set_mouseup_callback_on_thread,
  /** @export */
  emscripten_set_wheel_callback_on_thread: _emscripten_set_wheel_callback_on_thread,
  /** @export */
  emwgpuAdapterRequestDevice: _emwgpuAdapterRequestDevice,
  /** @export */
  emwgpuBufferGetConstMappedRange: _emwgpuBufferGetConstMappedRange,
  /** @export */
  emwgpuBufferMapAsync: _emwgpuBufferMapAsync,
  /** @export */
  emwgpuBufferUnmap: _emwgpuBufferUnmap,
  /** @export */
  emwgpuDelete: _emwgpuDelete,
  /** @export */
  emwgpuDeviceCreateBuffer: _emwgpuDeviceCreateBuffer,
  /** @export */
  emwgpuDeviceCreateShaderModule: _emwgpuDeviceCreateShaderModule,
  /** @export */
  emwgpuDeviceDestroy: _emwgpuDeviceDestroy,
  /** @export */
  emwgpuGetPreferredFormat: _emwgpuGetPreferredFormat,
  /** @export */
  emwgpuInstanceRequestAdapter: _emwgpuInstanceRequestAdapter,
  /** @export */
  emwgpuWaitAny: _emwgpuWaitAny,
  /** @export */
  environ_get: _environ_get,
  /** @export */
  environ_sizes_get: _environ_sizes_get,
  /** @export */
  exit: _exit,
  /** @export */
  invoke_ii,
  /** @export */
  invoke_iii,
  /** @export */
  invoke_iiii,
  /** @export */
  invoke_vi,
  /** @export */
  invoke_vii,
  /** @export */
  invoke_viii,
  /** @export */
  mc2CanvasLeft,
  /** @export */
  mc2CanvasTop,
  /** @export */
  mc2PointerLocked,
  /** @export */
  mc2_web_audio_blocked,
  /** @export */
  mc2_web_audio_close,
  /** @export */
  mc2_web_audio_is_playing,
  /** @export */
  mc2_web_audio_open,
  /** @export */
  mc2_web_audio_play,
  /** @export */
  mc2_web_audio_plays,
  /** @export */
  mc2_web_audio_resume,
  /** @export */
  mc2_web_audio_set_pan,
  /** @export */
  mc2_web_audio_set_volume,
  /** @export */
  mc2_web_audio_stop,
  /** @export */
  mc2v_audio,
  /** @export */
  mc2v_close,
  /** @export */
  mc2v_frame,
  /** @export */
  mc2v_rewind,
  /** @export */
  random_get: _random_get,
  /** @export */
  wgpuAdapterGetInfo: _wgpuAdapterGetInfo,
  /** @export */
  wgpuCommandEncoderBeginRenderPass: _wgpuCommandEncoderBeginRenderPass,
  /** @export */
  wgpuCommandEncoderCopyTextureToBuffer: _wgpuCommandEncoderCopyTextureToBuffer,
  /** @export */
  wgpuCommandEncoderFinish: _wgpuCommandEncoderFinish,
  /** @export */
  wgpuDeviceCreateBindGroup: _wgpuDeviceCreateBindGroup,
  /** @export */
  wgpuDeviceCreateBindGroupLayout: _wgpuDeviceCreateBindGroupLayout,
  /** @export */
  wgpuDeviceCreateCommandEncoder: _wgpuDeviceCreateCommandEncoder,
  /** @export */
  wgpuDeviceCreatePipelineLayout: _wgpuDeviceCreatePipelineLayout,
  /** @export */
  wgpuDeviceCreateRenderPipeline: _wgpuDeviceCreateRenderPipeline,
  /** @export */
  wgpuDeviceCreateSampler: _wgpuDeviceCreateSampler,
  /** @export */
  wgpuDeviceCreateTexture: _wgpuDeviceCreateTexture,
  /** @export */
  wgpuInstanceCreateSurface: _wgpuInstanceCreateSurface,
  /** @export */
  wgpuQueueSubmit: _wgpuQueueSubmit,
  /** @export */
  wgpuQueueWriteBuffer: _wgpuQueueWriteBuffer,
  /** @export */
  wgpuQueueWriteTexture: _wgpuQueueWriteTexture,
  /** @export */
  wgpuRenderPassEncoderDraw: _wgpuRenderPassEncoderDraw,
  /** @export */
  wgpuRenderPassEncoderDrawIndexed: _wgpuRenderPassEncoderDrawIndexed,
  /** @export */
  wgpuRenderPassEncoderEnd: _wgpuRenderPassEncoderEnd,
  /** @export */
  wgpuRenderPassEncoderSetBindGroup: _wgpuRenderPassEncoderSetBindGroup,
  /** @export */
  wgpuRenderPassEncoderSetIndexBuffer: _wgpuRenderPassEncoderSetIndexBuffer,
  /** @export */
  wgpuRenderPassEncoderSetPipeline: _wgpuRenderPassEncoderSetPipeline,
  /** @export */
  wgpuRenderPassEncoderSetVertexBuffer: _wgpuRenderPassEncoderSetVertexBuffer,
  /** @export */
  wgpuSurfaceConfigure: _wgpuSurfaceConfigure,
  /** @export */
  wgpuSurfaceGetCurrentTexture: _wgpuSurfaceGetCurrentTexture,
  /** @export */
  wgpuSurfaceUnconfigure: _wgpuSurfaceUnconfigure,
  /** @export */
  wgpuTextureCreateView: _wgpuTextureCreateView,
  /** @export */
  wgpuTextureDestroy: _wgpuTextureDestroy
};

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    dynCall_vii(index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return dynCall_ii(index,a1);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vi(index,a1) {
  var sp = stackSave();
  try {
    dynCall_vi(index,a1);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    dynCall_viii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  var sp = stackSave();
  try {
    return dynCall_iii(index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return dynCall_iiii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

function callMain(args = []) {

  var entryFunction = _main;

  args.unshift(thisProgram);

  var argc = args.length;
  var argv = stackAlloc((argc + 1) * 4);
  var argv_ptr = argv;
  for (var arg of args) {
    HEAPU32[((argv_ptr)>>2)] = stringToUTF8OnStack(arg);
    argv_ptr += 4;
  }
  HEAPU32[((argv_ptr)>>2)] = 0;

  try {

    var ret = entryFunction(argc, argv);

    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  } catch (e) {
    return handleException(e);
  }
}

function run(args = arguments_) {

  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    preMain();

    Module['onRuntimeInitialized']?.();

    var noInitialRun = Module['noInitialRun'] || false;
    if (!noInitialRun) callMain(args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(() => {
      setTimeout(() => Module['setStatus'](''), 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
}

var wasmExports;

// With async instantation wasmExports is assigned asynchronously when the
// instance is received.
createWasm();

run();

// end include: postamble.js

