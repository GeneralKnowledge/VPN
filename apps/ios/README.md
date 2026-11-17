# Northstar VPN for iPhone (provisional name)

The native iPhone app for the VPN service in this repository, made with [Forge](https://github.com/GeneralKnowledge/ixOS): the logic is Rust, the screens are SwiftUI, and it builds and installs on an iPhone from Linux with xtool.

## What it does today

1. Sign in with a VPN account made on the website (email or username).
2. Show the plan, its status and when it renews or ends.
3. Add this iPhone as a WireGuard device at a chosen location (the plan's device limit applies).
4. Hand the device's WireGuard config to the official [WireGuard app](https://apps.apple.com/app/wireguard/id1441195209) through the share sheet. WireGuard imports it as a tunnel and connects.
5. Send an existing device's config again, or remove a device.

It takes no payments: plans are bought on the website.

## What it doesn't do yet

It has no tunnel of its own. That needs a Network Extension, which Apple only allows on a paid developer team enrolled as an organisation (App Review 5.4). Until then WireGuard does the connecting. When the tunnel comes, it goes into this app.

## Run it

```bash
forge run ios --project apps/ios     # from the repository root, on the machine with xtool
forge test --project apps/ios        # the Rust tests
```

It uses the sandbox bundle id `org.forgemobile.agentlab` while the name is provisional, and takes one of a free Apple team's three app slots. It is not part of Device Lab: the VPN repository depends on Forge, never the other way round.

The server address is typed on the sign-in screen and must be `https`. The API it calls is described in [docs/app-api.md](../../docs/app-api.md).

## What goes where

| Path | What it is |
|------|------------|
| `rust/src/lib.rs` | The core: the session (in the Keychain), the plan, devices and locations, and the commands the screens call |
| `rust/src/api.rs` | The VPN service's JSON API over Forge's HTTP client |
| `rust/src/tests.rs` | Tests against a fake server |
| `Sources/AppHost/AppModel.swift` | The view model: calls Rust, holds what the screens show, writes the config file for the share sheet and deletes it after |
| `Sources/AppHost/ContentView.swift` | Sign-in, home and location picker screens |
| `Sources/AppHost/ShareConfigSheet.swift` | The share sheet that hands the config to WireGuard |
| `Sources/AppHost/AppHost.swift` | Opens the Rust core once per process and installs the Keychain |
| `Generated/` | Swift bindings generated from `rust/`. Don't edit; `forge bindings generate --project apps/ios` rewrites them |
| `forge.toml` | Name, bundle id, version. `Info.plist`, `App.entitlements` and `xtool.yml` are generated from it |
| `uitests/smoke.toml` | A UI test for a plugged-in iPhone (`forge ui run uitests/smoke.toml`) |
| `Xcode/` | An Xcode project for a Mac. Never required; its build phase points at a Forge checkout path you may need to change |

The session token is kept in the Keychain, never in a file. A WireGuard config holds the device's private key, so the app writes it to a temporary file only for the share sheet and deletes it when the sheet closes.
