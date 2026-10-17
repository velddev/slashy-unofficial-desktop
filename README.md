# Slashy for Windows

An unofficial Windows desktop app for [Slashy](https://www.slashy.com), the AI email client. It's your normal Slashy
inbox in its own window, with the things a desktop mail app should do: notifications, opening email links and `.eml`
files, drafts in their own windows, and an inbox that opens instantly and even works offline.

> Not made by or affiliated with Slashy. You need a Slashy account.

## Install

1. Download `Slashy-Setup-<version>.exe` from the [latest release](https://github.com/velddev/slashy-windows/releases/latest).
2. Run it. It installs just for you (no admin rights needed) and adds Slashy to the Start menu and your desktop.
   Windows may show a SmartScreen warning the first time; choose **More info**, then **Run anyway**.
3. Sign in with Google or Microsoft. Sign-in happens in your web browser; when it's done, your browser asks to open
   Slashy. Allow it, and you're in.

Requires Windows 10 or 11 (64-bit).

On Linux there's no download yet, but you can build it yourself; see
[DEVELOPMENT.md](DEVELOPMENT.md#linux).

## What you get

**Notifications.** New mail shows up as a normal Windows notification. Click it to jump straight to the email.

**Drafts in their own window.** On any draft, click **Pop Out** (or press **Ctrl+Shift+P**) and it opens in a compact
window of its own, so you can keep reading your inbox while you write. You can also drag a tab out of the tab bar, or
right-click a link and choose **Open in new window**.

**Your default email app.** Slashy can open the email links you click (`mailto:`) and `.eml` files.
- Slashy offers this once, in a small card at the bottom of the sidebar. You can also do it any time from
  **Settings > Desktop > Default email app**. Windows then opens its own settings, where you pick Slashy.
- To open `.eml` files with Slashy, right-click one, choose **Open with**, and pick Slashy. They open in a viewer
  that looks like Slashy, with images from the internet blocked; **Reply in Slashy** starts a reply, **Save** keeps a
  copy.
- Emails attached to emails (`.eml` attachments) open in that viewer when you click them, without saving anything to
  your PC.

**Fast, and works offline.** Slashy's app is kept on your PC, so it opens without waiting on the internet. Offline, you
can still read the emails Slashy has downloaded and work through your inbox; changes sync when you're back online.

**Stays out of the way.** Closing the window keeps Slashy running in the tray (near the clock), so notifications keep
coming and it reopens instantly. Quit from the tray icon. Slashy also remembers where you left its window and doesn't
grab focus when it starts.

**Zoom.** **Ctrl +** and **Ctrl −** zoom in and out, **Ctrl 0** resets. Slashy remembers your zoom level.

## Settings > Desktop

Open Slashy's settings (**Ctrl + ,**) and choose **Desktop**, or right-click the tray icon and choose **Desktop
settings**. There you can:

- Check for app updates, or restart to install one that's ready.
- See which version of Slashy's app is stored on your PC, and check for a newer one.
- Turn on **Open at sign-in**, so Slashy starts in the background when you sign in to Windows.
- Turn off **Keep running when closed** if you'd rather closing the window quit Slashy.
- Make Slashy your default email app, and reset the zoom.

## Updates

Slashy for Windows updates itself. It checks when it starts and every few hours, downloads updates in the background,
and installs them the next time you quit. Slashy's own app is refreshed on startup and while your PC is idle.

## Your data

Your account and email are Slashy's; this app shows the same Slashy you'd use in a browser and talks to the same
services. On your PC it keeps its settings, your sign-in, and a copy of Slashy's app in
`%APPDATA%\slashy-windows`.

## Uninstall

Go to **Settings > Apps > Installed apps**, find **Slashy**, and choose **Uninstall**. This also removes Slashy as an
email-link and `.eml` handler. To remove your sign-in and the stored copy of Slashy's app too, delete the
`%APPDATA%\slashy-windows` folder afterwards.

## Troubleshooting

- **Signing in doesn't come back to the app.** After signing in, your browser asks to open Slashy; allow it. If
  nothing happens, click **Click here** on the "Opening Slashy..." page.
- **Slashy isn't listed for `.eml` files or email links.** Start Slashy once after installing; it registers itself
  then.
- **Something looks broken after Slashy changes their site.** Open **Settings > Desktop** and click **Check now** next
  to **Web app** to fetch Slashy's latest version, then **Apply now**.

---

Building it yourself or contributing? See [DEVELOPMENT.md](DEVELOPMENT.md).
