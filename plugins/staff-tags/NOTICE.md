## Third-party code

This plugin is a Revenge Next port of **Staff Tags** by **Fiery** and **シグマ siguma**, from
[shipwr3ckd/revengeplugin](https://github.com/shipwr3ckd/revengeplugin), by way of the
classic-Revenge port in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins).

The tag rules — which roles map to OWNER / ADMIN / STAFF / MOD / VC Mod / Chat Mod / WEBHOOK, and
the permission checks behind them — are from the original.

Upstream is licensed **CC0-1.0** (public domain dedication), so it can be used under this
repository's GPL-3.0 with no licence obligation. The attribution is courtesy.

Substantially rewritten for Revenge Next: the module lookups, the patcher hook shapes, the
member-list filter, and a self-contained brightness calculation replacing
`revenge.discord.common.chroma`, which doesn't exist on this platform.
