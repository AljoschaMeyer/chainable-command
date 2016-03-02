/*
* Example for simple synchronous command chaining.
*/
var CommandInstance = require('./');

/*
* Counter command
*/
var initCounter = function () {
	var delta = 1;
	if (this.options.from > this.options.to) {
		delta = -1;
	}

	for (var i = this.options.from; i !== this.options.to; i += delta) {
		if (i === 12) {
			this.stderr('Nah, no 12.\n');
		} else {
			this.stdout(String(i) + '\n');
		}
	}

	this.exit(0);
	return Promise.resolve();
};

var counterCommand = new CommandInstance({
	init: initCounter,
	instanceOptions: {
		from: 17,
		to: 10
	},
	stdinOptions: {objectMode: true},
	stdoutOptions: {objectMode: true},
	stderrOptions: {objectMode: true}
});

/*
* FizzBuzz command
*/
var initFB = function () {
	this.fizzCount = 0;
	return Promise.resolve();
};

var onInputFB = function (input) {
	var number = parseInt(input, 10);
	if (Number.isNaN(number)) {
		// method provided by library
		this.stderr('invalid input, expected a number\n');
	} else {
		var fb = '';
		if (number % 3 === 0) {
			fb += 'Fizz';
			this.fizzCount++;
		}
		if (number % 5 === 0) {
			fb += 'Buzz';
		}

		this.stdout(fb === '' ? String(number) + '\n' : fb + '\n');
	}
	return Promise.resolve();
};

var cleanupFB = function () {
	this.stdout('fizzCount: ' + this.fizzCount + '\n');
	return Promise.resolve();
};

var fizzbuzzCommand = new CommandInstance({
	init: initFB,
	onInput: onInputFB,
	cleanup: cleanupFB,
	stdinOptions: {objectMode: true},
	stdoutOptions: {objectMode: true},
	stderrOptions: {objectMode: true}
});

/*
* Combined usage
*/

fizzbuzzCommand.stdout.pipe(process.stdout);
fizzbuzzCommand.stderr.pipe(process.stderr);
counterCommand.stdout.pipe(fizzbuzzCommand.stdin);
counterCommand.stderr.pipe(process.stderr);

fizzbuzzCommand.on('ready', function () {
	counterCommand.start();
});

fizzbuzzCommand.start();
