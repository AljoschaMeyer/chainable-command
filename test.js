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
			t.end();
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
			t.end();
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
});

test.cb('calling exit in a lifecycle function closes stdin', t => {
	t.plan(2);

	// test for init
	const cmd1 = new CommandInstance({
		init: function () {
			this.exit();
			return Promise.resolve();
		}
	});

	cmd1.stdin.on('finish', () => {
		t.pass();
	});

	cmd1.start();

	// test for onInput
	const cmd2 = new CommandInstance({
		onInput: function () {
			this.exit();
			return Promise.resolve();
		}
	});

	cmd2.stdin.on('finish', () => {
		t.pass();
	});

	cmd2.on('ready', () => {
		cmd2.stdin.write('foo');
	});

	cmd2.start();

	// no test for cleanup, for cleanup to be called, stdin has to have been closed already

	setTimeout(() => {
		t.end();
	}, 500);
});

test.cb('calling exit leads to cleanup being called', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		init: function () {
			this.exit();
			return Promise.resolve();
		},
		cleanup: function () {
			t.pass();
			t.end();
			return Promise.resolve();
		}
	});

	cmd.start();
});

test.cb('cleanup ends stdout and stderr', t => {
	t.plan(2);

	const cmd = new CommandInstance({
		init: function () {
			this.exit();
			return Promise.resolve();
		}
	});

	cmd.stdout.on('data', () => {});
	cmd.stderr.on('data', () => {});

	cmd.stdout.on('end', () => {
		t.pass();
	});

	cmd.stderr.on('end', () => {
		t.pass();
		t.end();
	});

	cmd.start();
});

test.cb('if reaching cleanup without an exit call, the exit event has no msg and code 0', t => {
	// test for init
	const cmd = new CommandInstance();

	cmd.on('ready', () => {
		cmd.stdin.end();
	});

	cmd.on('exit', (code) => {
		t.is(code, 0);
		t.end();
	});

	cmd.start();
});

test.cb('calling exit sets the values for the exit event', t => {
	const testCode = 42;
	const testMsg = 'foo';
	const cmd = new CommandInstance({
		init: function () {
			this.exit(testCode, testMsg);
			return Promise.resolve();
		}
	});

	cmd.on('exit', (code, msg) => {
		t.is(code, testCode);
		t.is(msg, testMsg);
		t.end();
	});

	cmd.start();
});

test.cb('with multiple exit calls, the first one wins', t => {
	const cmd = new CommandInstance({
		onInput: function () {
			this.exit(1, 'foo');
			this.exit(2, 'bar');
			return Promise.resolve();
		}
	});

	cmd.on('exit', (code, msg) => {
		t.is(code, 1);
		t.is(msg, 'foo');
		t.end();
	});

	cmd.on('ready', () => {
		cmd.stdin.write('hi');
	});

	cmd.start();
});

test.cb('lifecycle functions can communicate by setting attributes of this', t => {
	const cmd = new CommandInstance({
		init: function () {
			this.foo = 'bar';
			return Promise.resolve();
		},
		onInput: function () {
			t.is(this.foo, 'bar');
			t.end();
			return Promise.resolve();
		}
	});

	cmd.on('ready', () => {
		cmd.stdin.write('hi');
	});

	cmd.start();
});

test.cb('writing null to stderr throws an error', t => {
	const cmd = new CommandInstance({
		init: function () {
			this.stderr(null);
			return Promise.resolve();
		}
	});

	setTimeout(() => {
		t.end();
		return Promise.resolve();
	}, 500);

	t.throws(() => {
		cmd.start();
	});
});

test.cb('writing null to stdout throws an error', t => {
	const cmd = new CommandInstance({
		init: function () {
			this.stdout(null);
			return Promise.resolve();
		}
	});

	setTimeout(() => {
		t.end();
		return Promise.resolve();
	}, 500);

	t.throws(() => {
		cmd.start();
	});
});
