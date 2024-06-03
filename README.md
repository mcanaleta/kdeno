### Kdeno

Deno utils for misc scripting tasks.

Example:

```typescript
# !/usr/bin/env -S deno run --allow-env --allow-run
import * as h from "https://raw.githubusercontent.com/mcanaleta/kdeno/main/src/hetzner.ts";

const servers = await h.hcloudServerList();
console.log(servers);
```
