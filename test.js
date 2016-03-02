import test from 'ava';

import CommandInstance from './';

var stream = require('stream');
var EventEmitter = require('events').EventEmitter;

test('exports a class', t => {
	const cmd = new CommandInstance();
	t.is(typeof CommandInstance, 'function');
	t.is(typeof cmd, 'object');
	t.ok(cmd instanceof CommandInstance);
});

test('is an event emitter', t => {
	const cmd = new CommandInstance();
	t.ok(cmd instanceof EventEmitter);
});

test('exposes stdin, stdout and stderr streams', t => {
	const cmd = new CommandInstance();
	t.ok(cmd.stdin instanceof stream.Writable);
	t.ok(cmd.stdout instanceof stream.Readable);
	t.ok(cmd.stderr instanceof stream.Readable);
});

test('has a start() method', t => {
	const cmd = new CommandInstance();
	t.is(typeof cmd.start, 'function');
});

test('calling start() eventually executes the given init function', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		init: () => {
			t.pass();
			return Promise.resolve();
		}
	});

	cmd.start();
});

test('multiple start() calls do not execute init multiple times', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		init: () => {
			t.pass();
			return Promise.resolve();
		}
	});

	cmd.start();
	cmd.start();
});

test.cb('after init is resolved, a \'ready\' event is emitted', t => {
	// indicate whether the event was emitted
	let flag = false;

	const cmd = new CommandInstance({
		init: () => {
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve();
				}, 500);
			});
		}
	});

	cmd.on('ready', () => {
		flag = true;
	});

	cmd.start();

	// make sure event not emitted before init is settled
	t.false(flag);

	setTimeout(() => {
		// make sure the event was emitted after init was settled
		t.true(flag);
		t.end();
	}, 1000);
});

test.cb('writing to stdin before ready gives an error', t => {
	// expect 1 error for the write before ready, but none for the call afterwards
	t.plan(1);

	const cmd = new CommandInstance();
	cmd.stdin.on('error', () => {
		t.pass();
	});

	// write again when ready, don't expect error
	cmd.on('ready', () => {
		cmd.stdin.write('foo');
		t.end();
	});

	// write before ready, expect error
	cmd.stdin.write('foo');

	cmd.start();
});

test.cb('writing to stdin triggers onInput with chunk and enc', t => {
	const chunk = 'Hi!';
	const enc = 'utf8';
	const buf = new Buffer(chunk, enc);
	const cmd = new CommandInstance({
		onInput: (passedChunk, passedEnc) => {
			t.same(passedChunk, buf);
			t.same(passedEnc, 'buffer');
			t.end();
		}
	});

	cmd.on('ready', () => {
		cmd.stdin.write(chunk, enc);
	});

	cmd.start();
});

test('writing to stdin before ready does not trigger onInput', t => {
	const cmd = new CommandInstance({
		onInput: () => {
			t.fail();
		}
	});

	cmd.stdin.on('error', () => {
		// noop handler so we don't fail on the stdin error
	});

	cmd.stdin.write('Hi!');
});

test('cleanup is called when stdin is ended and no input is processed', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		cleanup: () => {
			t.pass();
			return Promise.resolve();
		}
	});

	cmd.stdin.end();
});

test.cb('cleanup is called when stdin is ended and the last input finishes processing', t => {
	// indicate whether cleanup has been called
	let flag = false;

	const cmd = new CommandInstance({
		onInput: () => {
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve();
				}, 500);
			});
		},
		cleanup: () => {
			flag = true;
			return Promise.resolve();
		}
	});

	cmd.on('ready', () => {
		cmd.stdin.write('Hi!');
		cmd.stdin.write('Hi!');
		cmd.stdin.write('Hi!');
		cmd.stdin.end();

		setTimeout(() => {
			// cleanup has not been called while onInput is still working
			t.false(flag);
		}, 250);

		setTimeout(() => {
			// cleanup was called by now
			t.true(flag);
			t.end();
		}, 1000);
	});

	cmd.start();
});

test.cb('lifecycle functions have access to options.instanceOptions as this.options', t => {
	const opt = {
		foo: 'bar'
	};

	const cmd = new CommandInstance({
		instanceOptions: opt,
		init: function () {
			t.is(this.options, opt);
			return Promise.resolve();
		},
		onInput: function () {
			t.is(this.options, opt);
			return Promise.resolve();
		},
		cleanup: function () {
			t.is(this.options, opt);
			t.end();
			return Promise.resolve();
		}
	});

	cmd.on('ready', () => {
		cmd.stdin.write('Hi!');
	});

	cmd.start();

	setTimeout(() => {
		cmd.stdin.end();
	}, 500);
});

test.cb('this.stderr() in a lifecycle function pushes to stderr of the CommandInstance', t => {
	t.plan(6);

	const data = 'foo';
	const enc = 'utf8';

	const cmd = new CommandInstance({
		init: function () {
			this.stderr(data, enc);
			this.stderr(data, enc);
			this.stderr(data, enc);
			return Promise.resolve();
		},
		onInput: function () {
			this.stderr(data, enc);
			this.stderr(data, enc);
			return Promise.resolve();
		},
		cleanup: function () {
			this.stderr(data, enc);
			return Promise.resolve();
		}
	});

	cmd.stderr.on('data', (chunk) => {
		t.same(chunk, new Buffer(data, enc));
	});

	cmd.on('ready', () => {
		cmd.stdin.write('Hi!');
		cmd.stdin.end();
	});

	cmd.start();

	setTimeout(() => {
		t.end();
	}, 500);
});

test.cb('this.stdout() in a lifecycle function pushes to stdout of the CommandInstance', t => {
	t.plan(6);

	const data = 'foo';
	const enc = 'utf8';

	const cmd = new CommandInstance({
		init: function () {
			this.stdout(data, enc);
			this.stdout(data, enc);
			return Promise.resolve();
		},
		onInput: function () {
			this.stdout(data, enc);
			return Promise.resolve();
		},
		cleanup: function () {
			this.stdout(data, enc);
			this.stdout(data, enc);
			this.stdout(data, enc);
			return Promise.resolve();
		}
	});

	cmd.stdout.on('data', (chunk) => {
		t.same(chunk, new Buffer(data, enc));
	});

	cmd.on('ready', () => {
		cmd.stdin.write('Hi!');
		cmd.stdin.end();
	});

	cmd.start();

	setTimeout(() => {
		t.end();
	}, 500);
});
