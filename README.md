# `ArrayBuffer.prototype.transfer()` proposal

This is a proposal to add a new method, `transfer()`, to JavaScript's `ArrayBuffer` class. It has not yet been presented to the JavaScript standards committee.

## The problem

When dealing with binary data asynchronously, there is a conflict between efficiency and safety.

Consider a function such as the following:

```js
function validateAndWrite(arrayBuffer) {
  // Do some asynchronous validation.
  await validate(arrayBuffer);

  // Assuming we've got here, it's valid; write it to disk.
  await fs.writeFile("data.bin", arrayBuffer);
}
```

This function, as written, is fairly efficient. But it is not safe, or predictable: the caller can modify any data they pass in at any time, and the function will just keep using the same data. Consider:

```js
const data = new Uint8Array([0x01, 0x02, 0x03]);
validateAndWrite(data.buffer);
setTimeout(() => {
  data[0] = data[1] = data[2] = 0x00;
}, 50);
```

If `validate()` takes 49 milliseconds, then it's quite possible that `validateAndWrite()` ends up validating the original contents of the buffer (`0x01 0x02 0x03`) but writing the new contents of the buffer (`0x00 0x00 0x00`). That is, any security or robustness guarantees `validate()` was meant to provide are illusory.

(This gets worse if you consider how `fs.writeFile()` might be implemented; I have unconfirmed reports that Node.js's version directly reads the `ArrayBuffer`'s memory from another thread, so that it's possible to get a race condition and end up writing `0x01 0x00 0x00` or similar.)

The defensive way to write this code is to make a copy of the buffer before processing it:

```js
function validateAndWriteSafeButSlow(arrayBuffer) {
  // Copy first!
  const copy = arrayBuffer.slice();

  await validate(copy);
  await fs.writeFile("data.bin", copy);
}
```

However, this adds extra time and memory consumption to all binary-data-consuming functions; given that binary data often comes in large chunks, this is not generally desireable.

## Detaching and transferring

Some web platform APIs, notably the various `postMessage()` methods and the [BYOB reader mode for `ReadableStream`](https://streams.spec.whatwg.org/#example-manual-read-bytes), have a solution for this dillema. When you pass an `ArrayBuffer` (or wrapper around one, such as a typed array) to one of these APIs, they take ownership of the data block encapsulated in the `ArrayBuffer`.

Concretely, they [detach](https://tc39.github.io/ecma262/#sec-detacharraybuffer) the `ArrayBuffer` object itself. Essentially, it no longer "owns" the memory, and attempting to use it will throw ([sorta](https://github.com/tc39/ecma262/issues/678)). These APIs then use the backing bytes for their own purposes.

This proposal is for exposing that same capability to JavaScript

## `ArrayBuffer.prototype.transfer()`

To do this, we propose a new method, `ab.transfer()`, which detaches `ab` and returns a new `ArrayBuffer` pointing to the same data block. This would allow our above `validateAndWrite()` function to be safe and fast:

```js
function validateAndWriteSafeAndFast(arrayBuffer) {
  // Transfer first!
  const transferred = arrayBuffer.transfer();

  await validate(transferred);
  await fs.writeFile("data.bin", transferred);
}
```

Now attempts to modify an `ArrayBuffer` after passing it to `validateAndWriteSafeAndFast()` will throw, making it clear that the function has taken ownership of the data and does not expect further modification of it.

As a bonus, you can use this for providing a strong signal to the engine that it can free an `ArrayBuffer`'s memory, without needing to find all references to the `ArrayBuffer` object and null them out:

```js
arrayBuffer.transfer(); // don't save the result anywhere
```

## Bonus proposal: `ArrayBuffer.prototype.realloc(newByteLength)

As a secondary API, while we're in the area, we propose a related API, called `realloc()`. This transfers the contents of the `ArrayBuffer` into a new one with a new length. It is expected to have similar semantics to the [C `realloc()` function](http://en.cppreference.com/w/c/memory/realloc), allowing in-place expansion or contraction when possible.

The main use case for this is trimming an `ArrayBuffer`, while avoiding copies when possible.

For example, consider reading a file. You are given a low-level system API `file.readInto(buffer, offset, count)` that attempts to read `count` bytes from `file` into `buffer` starting at `offset`, and resolves with a promise for the number of bytes read:

```js
const buffer = new ArrayBuffer(1024 * 1024);
const bytesRead = await file.readInto(buffer, 0, buffer.byteLength);
```

If the file is small, `bytesRead` might be much less than 1 MiB, and so you're wasting memory. You could fix this, but it would require a copy:

```js
const tempBuffer = new ArrayBuffer(1024 * 1024);
const bytesRead = await file.readInto(tempBuffer, 0, tempBuffer.byteLength);
const buffer = tempBuffer.slice(0, bytesRead);
```

But with `ArrayBuffer.prototype.realloc()`, the implementation may be able to avoid the copy:

```js
const tempBuffer = new ArrayBuffer(1024 * 1024);
const bytesRead = await file.readInto(tempBuffer, 0, tempBuffer.byteLength);
const buffer = tempBuffer.realloc(bytesRead);
```

If implementation conditions align correctly, no copies are performed here: `buffer` points to the same region of memory as `tempBuffer`, but now any bytes between `bytesRead` and `1024 * 1024` are freed, since they can be accessed neither via `buffer` (whose length is `bytesRead`) nor via `tempBuffer` (which is now detached).

This API is less important than the `transfer()` API, and I look forward to the committee's feedback as to whether we should pursue it or not.

## FAQs

### What about SharedArrayBuffer?

It doesn't really make sense to add `transfer()` to `SharedArrayBuffer.prototype`. Certainly the use case, of avoiding concurrent access to the same data, doesn't make sense in this context. Additionally, we have no concept of detaching for `SharedArrayBuffer` instances.

## History and acknowledgments

This proposal derives from Luke Wagner's [`ArrayBuffer.transfer`](https://gist.github.com/lukewagner/2735af7eea411e18cf20) strawperson, split into two distinct methods: `transfer()` and `realloc()`. That strawperson in turn derives from a suggestion of Dmitry Lomov. Thanks to them both!

At that time one of the major envisioned use cases for the proposal was to provide resizable memory for asm.js. That use case has largely been subsumed by WebAssembly, and so the proposal was abandoned. I picked it up because I believe there is still a strong use case for transferring and trimming `ArrayBuffer`s even in pure JavaScript code.
