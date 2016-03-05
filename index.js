'use strict';
var stream = require('stream');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

module.exports = CommandInstance;

function CommandInstance(options) {
	EventEmitter.call(this);

	if (options === undefined) {
		options = {};
	}

	this.stdin = new stream.Writable(options.stdinOptions);
	this.stdout = new stream.Readable(options.stdoutOptions);
	this.stderr = new stream.Readable(options.stderrOptions);

	// flag indicating whether start has been called already
	var hasStarted = false;

	// flag indicating whether this is waiting to call end
	var shouldEnd = false;

	// counts how many data calls are currently pending
	var work = 0;

	// stores the exit code and message as {code: int, msg: string}
	var exit = null;

	// used in some function definitions
	var self = this;

	// the supplied lifecycle functions are bound to lifecycleSelf
	var lifecycleSelf = {
		options: options.instanceOptions,
		operands: options.operands,
		killed: false,
		stderr: function (data, enc) {
			if (data === null) {
				throw new Error('A CommandInstance may not write null to its stderr');
			}
			self.stderr.push(data, enc);
		},
		stdout: function (data, enc) {
			if (data === null) {
				throw new Error('A CommandInstance may not write null to its stdout');
			}
			self.stdout.push(data, enc);
		},
		exit: function (code, msg) {
			if (exit === null) {
				exit = {code: code, msg: msg};
				self.stdin.end();
			}
		}
	};

	// define the init function internally, which at some point calls options.init
	var init = function () {
		// use the supplied function or a default if none was given
		var initFn = options.init === undefined ? function () {
			return Promise.resolve();
		} : options.init;

		var afterInit = function () {
			if (!shouldEnd) {
				self.stdin.uncork();
			}
		};

		// ensure init is called only once
		if (!hasStarted) {
			hasStarted = true;
			initFn.bind(lifecycleSelf)().then(afterInit).catch(afterInit);
		}
	};

	// define the end function internally, which at some point calls options.end
	var end = function () {
		// use the supplied function or a default if none was given
		var endFn = options.end === undefined ? function () {
			return Promise.resolve();
		} : options.end;

		var afterEnd = function () {
			self.stdout.push(null);
			self.stderr.push(null);
			// set default for the exit code
			if (exit === null) {
				exit = {
					code: 0
				};
			}
			self.emit('exit', exit.code, exit.msg);
		};

		endFn.bind(lifecycleSelf)().then(afterEnd).catch(afterEnd);
	};

	// Checks whether the CommandInstance may end and if so does it.
	var tryEnd = function () {
		if (work === 0 && shouldEnd) {
			end();
		}
	};

	// signals to close input, wait for datas to resolve and then end
	var prepareExit = function () {
		shouldEnd = true;
		self.emit('inputClosed');
		tryEnd();
	};

	// define the data function internally, which at some point calls options.data
	var data = function (chunk, enc) {
		// use the supplied function or a default if none was given
		var dataFn =	options.data === undefined ? function () {
			return Promise.resolve();
		} : options.data;

		var afterInput = function () {
			work--;
			tryEnd();
		};

		work++;
		dataFn.bind(lifecycleSelf)(chunk, enc).then(afterInput).catch(afterInput);
	};

	/*
	* implementation of stdin
	*/

	// force buffering of all input until the CommandInstance has been initialized
	this.stdin.cork();

	// delegate input to data
	this.stdin._write = function (chunc, enc, cb) {
		if (shouldEnd) {
			cb(new Error('Discarding input, CommandInstance is preparing to exit'));
		} else {
			data(chunc, enc);
			cb();
		}
	};
	// ready to end CommandInstance if stdin is ended
	this.stdin.on('finish', function () {
		prepareExit();
	});

	/*
	* implementation of stdout
	*/
	this.stdout._read = function () {
		// no-op
	};

	/*
	* implementation of stderr
	*/
	this.stderr._read = function () {
		// no-op
	};

	// The exposed function which begins the CommandInstance lifecycle
	this.start = function () {
		init();
	};

	// The exposed function which signals that this should terminate
	this.kill = function () {
		lifecycleSelf.killed = true;
		prepareExit();
	};
}
util.inherits(CommandInstance, EventEmitter);
