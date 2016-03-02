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

	/*
	* Set lifecycle methods.
	*/
	var init = options.init;
	if (init === undefined) {
		// The default init function does nothing but resolve a promise.
		init = function () {
			return Promise.resolve();
		};
	}

	var cleanup = options.cleanup;
	if (cleanup === undefined) {
		// The default cleanup function does nothing but resolve a promise.
		cleanup = function () {
			return Promise.resolve();
		};
	}

	// set shouldCleanup to true. Call cleanup if valid.
	var tryCleanup = function () {
		shouldCleanup = true;

		if (work === 0) {
			cleanup();
		}
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
		onInputFn(chunk, enc).then(afterInput).catch(afterInput);
	};

	/*
	* implementation of stdin
	*/
	// delegate input to onInput
	this.stdin._write = function (chunc, enc, cb) {
		if (isReady) {
			onInput(chunc, enc);
			cb();
		} else {
			cb(new Error('Discarding input, CommandInstance is not ready yet.'));
		}
	};
	// ready to end CommandInstance if stdin is ended
	this.stdin.on('finish', function () {
		tryCleanup();
	});

	// The exposed function which begins the CommandInstance lifecycle.
	this.start = function () {
		var self = this;
		// TODO move afterInit into init itself
		var afterInit = function () {
			if (!shouldCleanup) {
				isReady = true;
				self.emit('ready');
			}
		};

		if (!hasStarted) {
			hasStarted = true;
			init().then(afterInit).catch(afterInit);
		}
	};
}
util.inherits(CommandInstance, EventEmitter);
