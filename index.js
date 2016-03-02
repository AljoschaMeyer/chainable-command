'use strict';
var stream = require('stream');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

module.exports = CommandInstance;

function CommandInstance(options) {
	EventEmitter.call(this);

	this.stdin = new stream.Writable();
	this.stdout = new stream.Readable();
	this.stderr = new stream.Readable();

	// flag indicating whether start has been called already
	var hasStarted = false;

	// flag indicating whether init has been resolved already
	var isReady = false;

	// flag indicating whether this is waiting to call cleanup
	var shouldCleanup = false;

	// counts how many onInput calls are currently pending
	var work = 0;

	if (options === undefined) {
		options = {};
	}

	// used in some function definitions
	var self = this;

	var lifecycleSelf = {
		options: options.instanceOptions,
		stderr: function (data, enc) {
			self.stderr.push(data, enc);
		},
		stdout: function (data, enc) {
			self.stdout.push(data, enc);
		}
	};

	// define the init function internally, which at some point calls options.init
	var init = function () {
		var initFn = options.init === undefined ? function () {
			return Promise.resolve();
		} : options.init;

		var afterInit = function () {
			if (!shouldCleanup) {
				isReady = true;
				self.emit('ready');
			}
		};

		if (!hasStarted) {
			hasStarted = true;
			initFn.bind(lifecycleSelf)().then(afterInit).catch(afterInit);
		}
	};

	// define the cleanup function internally, which at some point calls options.cleanup
	var cleanup = function () {
		var cleanupFn = options.cleanup === undefined ? function () {
			return Promise.resolve();
		} : options.cleanup;

		var afterCleanup = function () {
			// impl
		};

		cleanupFn.bind(lifecycleSelf)().then(afterCleanup).catch(afterCleanup);
	};

	// Checks whether the CommandInstance may cleanup and if so does it.
	var tryCleanup = function () {
		if (work === 0 && shouldCleanup) {
			cleanup();
		}
	};

	// signals to close input, wait for onInputs to resolve and then cleanup
	var prepareExit = function () {
		shouldCleanup = true;
		tryCleanup();
	};

	// define the onInput function internally, which at some point calls options.onInput
	var onInput = function (chunk, enc) {
		var onInputFn =	options.onInput === undefined ? function () {
			return Promise.resolve();
		} : options.onInput;

		var afterInput = function () {
			work--;
			tryCleanup();
		};

		work++;
		onInputFn.bind(lifecycleSelf)(chunk, enc).then(afterInput).catch(afterInput);
	};

	/*
	* implementation of stdin
	*/
	// delegate input to onInput
	this.stdin._write = function (chunc, enc, cb) {
		if (isReady && !shouldCleanup) {
			onInput(chunc, enc);
			cb();
		} else {
			cb(new Error(shouldCleanup ? 'Discarding input, CommandInstance is preparing to exit' : 'Discarding input, CommandInstance is not ready yet.'));
		}
	};
	// ready to end CommandInstance if stdin is ended
	this.stdin.on('finish', function () {
		prepareExit();
	});

	/*
	* implementation of stdout
	*/
	this.stdout._read = function () {};

	/*
	* implementation of stderr
	*/
	this.stderr._read = function () {};

	// The exposed function which begins the CommandInstance lifecycle.
	this.start = function () {
		init();
	};
}
util.inherits(CommandInstance, EventEmitter);
