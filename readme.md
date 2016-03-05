# chainable-command
[![Build Status](https://travis-ci.org/AljoschaMeyer/chainable-command.svg?branch=master)](https://travis-ci.org/AljoschaMeyer/chainable-command)[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

> Provides command objects with input-, output- and error-stream.

## Overview

This is a low-level implementation of a command class which communicates with other commands via streams.

### General
This module exports a `CommandInstance` class. A CommandInstance represents a command in a command chain. It communicates via three streams: A writable `stdin`, a readable `stdout` and a readable `stderr`. In a typical usecase, the `stdout` of a CommandInstance would be piped into the `stdin` of the next command instance.

The CommandInstance communicates with the outside through events (`inputClosed` and `exit`) and two functions (`start` and `kill`).

The behavior of a CommandInstance, i.e. what it does with input, and which output it produces, is defined through three lifecycle functions passed in the constructor options: `init`, `data` and `end`.

### Lifecycle
The CommandInstance lifecycle is started by calling `commandInstance.start()`. Pushing data to `commandInstance.stdin` before `start()` was called leads to an error.

The `init` lifecycle function is invoked right after `commandInstance.start()` has been called and will only be called once. It has to return a promise. When the promise is resolved (and `exit()` (see below) has not been called in `init`), the input to the `stdin` stream will now be processed.

Each time data is written to `commandInstance.stdin`, the `data` lifecycle function is called with the received data and the encoding of the data, i.e. the first two arguments to `Writable._write()`. `onInit` has to return a promise.

The `end` lifecycle function is invoked exactly once, at the end of the CommandInstance lifecycle. It is guaranteed that `init` has been resolved before, and that no `data` will be invoked or resolved after `end` has been called. `end` has to return a promise as well. Aside from manually exiting the CommandInstance, `end` is invoked when no further input will be received and no input is currently processed. After end is resolved, `stdout` and `stderr` of the CommandInstance are closed (by pushing null).

The three lifecycle functions have some properties bound to `this`:
- `options`: The hash passed to the CommandInstance constructor as `options.instanceOptions`
- `operands`: The object passed to the CommandInstance constructor as `options.operands`
- `stdout(data, enc)`: Pushes data to `commandInstance.stdout` with the encoding `enc` by calling `stream.Readable.push(data, enc)`.
- `stderr(data, enc)`: Pushes data to `commandInstance.stderr` with the encoding `enc` by calling `stream.Readable.push(data, enc)`.
- `exit(code, message)`: Causes the CommandInstance to close its input stream, wait for all currently processed input to resolve and then exits by calling `end` and emitting an `'exit'` event. The `'exit'` event contains `code` and `message` All calls to this after the first call are no-ops.

## API
`import CommandInstance from 'chainable-command';`

Instances of CommandInstance are EventEmitters.

#### Events:
- `'inputClosed'`: Emitted when `instance.stdin` stops accepting input.
- `'exit'`: The CommandInstance has reached the end of its lifecycle. All streams are closed, no input is still processed. Emitting this event is the last thing a CommandInstance does.
  - `code`: The exit code. Defaults to `0` if it has not been explicitely set in one of the lifecycle functions via `exit(code, msg)`.
  - `msg`: The optional message set with `exit(code, msg)`. Defaults to `undefined`.

### Constructor:
`new CommandInstance(options);`

Supported options:

- `instanceOptions`: This is available to the lifecycle functions as `this.options`.
- `operands`: This is available to the lifecycle functions as `this.operands`.
- `stdinOptions`: These options are passed to the `stream.Writable` constructor of `instance.stdin`.
- `stdoutOptions`: These options are passed to the `stream.Readable` constructor of `instance.stdout`.
- `stderrOptions`: These options are passed to the `stream.Readable` constructor of `instance.stderr`.
- `init()`: The init lifecycle function is called exactly once, just before the CommandInstance starts accepting input. Has to return a promise.
- `data(chunk, encoding)`: The data lifecycle function is called once for each input received via `instance.stdin` with the received chunk and encoding as arguments. Has to return a promise.
- `end()`: The end lifecycle function is called exactly once, just before the CommandInstance emits the `'exit'` event. Has to return a promise.

### Fields

- `stdin`: A writable stream to which may be written before the `'inputClosed'` event. Each write leads to `data()` being called with the written chunk and encoding.
- `stdout`: A readable stream which may push data during the lifecycle functions.
- `stderr`: A readable stream which may push data during the lifecycle functions.

### Instance Methods:

- `start()`: Signals the CommandInstance to start its lifecycle. The streams should be connected before this is called.
- `kill()`: Signals the CommandInstance to end its lifecycle. It stops accepting new input. Calling does not interrupt `data` calls which are currently processing input, but it sets a flag which `data` can check to see whether it should terminate early. If called before `init` has been resolved, no input is accepted.

### Context for the lifecycle functions
Inside the lifecycle functions (`init`, `data` and `end`), `this` is bound to a special lifecycle context, which provides the following fields:

- `options`: The options passed to this CommandInstance as `options.instanceOptions`.
- `killed`: A flag indicating whether kill has been called for this CommandInstance.
- `stdout(data, encoding)`: Calling this function will write the given `data` to `instance.stdout` with the given `encoding`. Throws an error if `data` is `null`.
- `stderr(data, encoding)`: Calling this function will write the given `data` to `instance.stderr` with the given `encoding`. Throws an error if `data` is `null`.
- `exit(code, message)`: Calling this function signals the CommandInstance to stop taking input and to terminate once all currently processd input is finished. `code` and `message` are used for the `'exit'` event emitted at the very end of the lifecycle. The `code` end `message` for the first call to `exit` are used. If the command terminates without an explicit call to `exit`, the `code` for the `'exit'` event is `0` and the `msg` is `undefined`.

## License

MIT © [AljoschaMeyer](https://github.com/AljoschaMeyer)
