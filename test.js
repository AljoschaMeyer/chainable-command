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

test.cb('writing to stdin before started triggers data after initialization (in the correct order)', t => {
	var inputCounter = 0;

	const cmd = new CommandInstance({
		data: function (input) {
			if (inputCounter === 0) {
				t.same(input, new Buffer('foo'));
			} else {
				t.same(input, new Buffer('bar'));
				t.end();
			}
			inputCounter++;
			return Promise.resolve();
		}
	});

	// write before start
	cmd.stdin.write('foo');
	cmd.stdin.write('bar');

	cmd.start();
});

test.cb('writing to stdin triggers data with chunk and enc', t => {
	const chunk = 'Hi!';
	const enc = 'utf8';
	const buf = new Buffer(chunk, enc);
	const cmd = new CommandInstance({
		data: (passedChunk, passedEnc) => {
			t.same(passedChunk, buf);
			t.same(passedEnc, 'buffer');
			t.end();
		}
	});

	cmd.start();
	cmd.stdin.write(chunk, enc);
});

test('writing to stdin before started does not directly trigger data', t => {
	const cmd = new CommandInstance({
		data: () => {
			t.fail();
		}
	});

	cmd.stdin.write('Hi!');
});

test('end is called when stdin is ended and no input is processed', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		end: () => {
			t.pass();
			return Promise.resolve();
		}
	});

	cmd.stdin.end();
});

test.cb('end is called when stdin is ended and the last input finishes processing', t => {
	// indicate whether end has been called
	let flag = false;

	const cmd = new CommandInstance({
		data: () => {
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve();
				}, 500);
			});
		},
		end: () => {
			flag = true;
			return Promise.resolve();
		}
	});

	cmd.start();

	cmd.stdin.write('Hi!');
	cmd.stdin.write('Hi!');
	cmd.stdin.write('Hi!');
	cmd.stdin.end();

	setTimeout(() => {
		// end has not been called while data is still working
		t.false(flag);
	}, 250);

	setTimeout(() => {
		// end was called by now
		t.true(flag);
		t.end();
	}, 1000);
});

test.cb('lifecycle functions have access to options.instanceOptions as this.options', t => {
	t.plan(3);

	const opt = {
		foo: 'bar'
	};

	const cmd = new CommandInstance({
		instanceOptions: opt,
		init: function () {
			t.is(this.options, opt);
			return Promise.resolve();
		},
		data: function () {
			t.is(this.options, opt);
			return Promise.resolve();
		},
		end: function () {
			t.is(this.options, opt);
			t.end();
			return Promise.resolve();
		}
	});

	cmd.start();
	cmd.stdin.write('Hi!');
	cmd.stdin.end();
});

test.cb('lifecycle functions have access to options.operands as this.operands', t => {
	const ops = {
		foo: 'bar'
	};

	const cmd = new CommandInstance({
		operands: ops,
		init: function () {
			t.is(this.operands, ops);
			return Promise.resolve();
		},
		data: function () {
			t.is(this.operands, ops);
			return Promise.resolve();
		},
		end: function () {
			t.is(this.operands, ops);
			t.end();
			return Promise.resolve();
		}
	});

	cmd.start();
	cmd.stdin.write('Hi!');
	cmd.stdin.end();
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
		data: function () {
			this.stderr(data, enc);
			this.stderr(data, enc);
			return Promise.resolve();
		},
		end: function () {
			this.stderr(data, enc);
			t.end();
			return Promise.resolve();
		}
	});

	cmd.stderr.on('data', (chunk) => {
		t.same(chunk, new Buffer(data, enc));
	});

	cmd.start();
	cmd.stdin.write('Hi!');
	cmd.stdin.end();
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
		data: function () {
			this.stdout(data, enc);
			return Promise.resolve();
		},
		end: function () {
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

	cmd.start();
	cmd.stdin.write('Hi!');
	cmd.stdin.end();
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

	// test for data
	const cmd2 = new CommandInstance({
		data: function () {
			this.exit();
			return Promise.resolve();
		}
	});

	cmd2.stdin.on('finish', () => {
		t.pass();
	});

	cmd2.start();
	cmd2.stdin.write('foo');

	// no test for end, for end to be called, stdin has to have been closed already

	setTimeout(() => {
		t.end();
	}, 500);
});

test.cb('calling exit leads to end being called', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		init: function () {
			this.exit();
			return Promise.resolve();
		},
		end: function () {
			t.pass();
			t.end();
			return Promise.resolve();
		}
	});

	cmd.start();
});

test.cb('end ends stdout and stderr', t => {
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

test.cb('if reaching end without an exit call, the exit event has no msg and code 0', t => {
	// test for init
	const cmd = new CommandInstance();

	cmd.on('exit', (code) => {
		t.is(code, 0);
		t.end();
	});

	cmd.start();
	cmd.stdin.end();
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
		data: function () {
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

	cmd.start();
	cmd.stdin.write('hi');
});

test.cb('lifecycle functions can communicate by setting attributes of this', t => {
	const cmd = new CommandInstance({
		init: function () {
			this.foo = 'bar';
			return Promise.resolve();
		},
		data: function () {
			t.is(this.foo, 'bar');
			t.end();
			return Promise.resolve();
		}
	});

	cmd.start();
	cmd.stdin.write('hi');
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

test('has a kill() method', t => {
	const cmd = new CommandInstance();
	t.is(typeof cmd.kill, 'function');
});

test('this.killed in lifecycle methods is false by default', t => {
	const cmd = new CommandInstance({
		init: function () {
			t.false(this.killed);
			return Promise.resolve();
		}
	});

	cmd.start();
});

test('this.killed in lifecycle methods is true after killed was called', t => {
	const cmd = new CommandInstance({
		init: function () {
			t.true(this.killed);
			return Promise.resolve();
		}
	});

	cmd.kill();
	cmd.start();
});

test('end is called when the CommandInstance is killed and no input is processed', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		end: () => {
			t.pass();
			return Promise.resolve();
		}
	});

	cmd.kill();
});

test.cb('end is called when the CommandInstance is killed and the last input finishes processing', t => {
	// indicate whether end has been called
	let flag = false;

	const cmd = new CommandInstance({
		data: () => {
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve();
				}, 500);
			});
		},
		end: () => {
			flag = true;
			return Promise.resolve();
		}
	});

	cmd.start();
	cmd.stdin.write('Hi!');
	cmd.stdin.write('Hi!');
	cmd.stdin.write('Hi!');

	// kill after init has resolved
	setTimeout(() => {
		console.log('about to kill');
		cmd.kill();
	}, 0);

	setTimeout(() => {
		// end has not been called while data is still working
		console.log('checking flag nr1');
		t.false(flag);
	}, 250);

	setTimeout(() => {
		// end was called by now
		console.log('checking flag nr 2');
		t.true(flag);
		t.end();
	}, 1000);
});

test('inputClosed is emitted when stdin is ended', t => {
	t.plan(1);

	const cmd = new CommandInstance();

	cmd.on('inputClosed', () => {
		t.pass();
	});

	cmd.stdin.end();
});

test('inputClosed when the CommandInstance is killed', t => {
	t.plan(1);

	const cmd = new CommandInstance();

	cmd.on('inputClosed', () => {
		t.pass();
	});

	cmd.kill();
});

test.cb('calling exit leads to inputClosed being emitted', t => {
	t.plan(1);

	const cmd = new CommandInstance({
		init: function () {
			this.exit();
			return Promise.resolve();
		}
	});

	cmd.on('inputClosed', () => {
		t.pass();
		t.end();
	});

	cmd.start();
});
