# cannon-es

- Version: 0.20.0 (MIT)
- Upstream: https://github.com/pmndrs/cannon-es
- Source: https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.cjs.js
- License: `LICENSE.cannon-es.txt`

The upstream CommonJS distribution is wrapped in a browser IIFE that exposes
`window.PGIPhysics`. Its sole Node dependency, `perf_hooks`, is mapped to the
browser's `performance` object. The upstream engine code is otherwise unchanged.

The local Jenga widget uses this engine for rigid-body contact, gravity and
friction. Its model parameters are tuned for the small website interaction;
they do not represent measured values from the PGI hardware or physical wood.
