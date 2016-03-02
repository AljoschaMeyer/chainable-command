# chainable-command
[![Build Status](https://travis-ci.org/AljoschaMeyer/chainable-command.svg?branch=master)](https://travis-ci.org/AljoschaMeyer/chainable-command)[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

> Provides command objects with input-, output- and error-stream.

## Overview

This is a low-level implementation. For more convenient usage, see TODO.

### General
This module exports a `CommandInstance` class. A CommandInstance represents a command in a command chain. It communicates via three streams: A writable `stdin`, a readable `stdout` and a readable `stderr`. In a typical usecase, the `stdout` of a CommandInstance would be piped into the `stdin` of the next command instance.

The behavior of a CommandInstance, i.e. what it does with input, and which output it produces, is defined through three lifecycle functions passed in the constructor options: `init`, `onInput` and `cleanup`.

### Lifecycle
The CommandInstance lifecycle is started by calling `commandInstance.start()`. Pushing data to `commandInstance.stdin` before `start()` was called leads to an error.

The `init` lifecycle function is invoked right after `commandInstance.start()` has been called and will only be called once. It has to return a promise. When the promise is resolved (TODO and `exit()` (see below) has not been called in `init`), a `'ready'` event is emitted by the CommandInstance, signaling that the `stdin` stream may now be written to.

Each time data is written to `commandInstance.stdin`, the `onInput` lifecycle function is called with the received data and the encoding of the data, i.e. the first two arguments to `Writable._write()`. All incoming data before the CommandInstance has emitted its `'ready'` event is ignored. `onInit` has to return a promise.

The `cleanup` lifecycle function is invoked exactly once, at the end of the CommandInstance lifecycle. It is guaranteed that `init` has been resolved before, and that no `onInput` will be invoked or resolved after `cleanup` has been called. `cleanup` has to return a promise as well. Aside from manually exiting the CommandInstance, `cleanup` is invoked when no further input will be received and no input is currently processed. After cleanup is resolved, `stdout` and `stderr` of the CommandInstance are closed (by pushing null).

The three lifecycle functions have some properties bound to `this`:
- `options`: The hash passed to the CommandInstance constructor as `options.instanceOptions`
- `stdout(data, enc)`: Pushes data to `commandInstance.stdout` with the encoding `enc` by calling `stream.Readable.push(data, enc)`.
- `stderr(data, enc)`: Pushes data to `commandInstance.stderr` with the encoding `enc` by calling `stream.Readable.push(data, enc)`.
- `exit(code, message)`: Causes the CommandInstance to close its input stream, wait for all currently processed input to resolve and then exits by calling `cleanup` and emitting an `'exit'` event. The `'exit'` event contains `code` and `message` All calls to this after the first call are no-ops.

## License

MIT © [AljoschaMeyer](https://github.com/AljoschaMeyer)
