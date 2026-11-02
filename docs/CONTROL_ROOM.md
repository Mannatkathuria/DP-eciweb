# Control room

`/control-room` shows every polling station the official's assignments cover: a sector officer's or RO's constituency, a DEO's district, a CEO's State, the whole country for the Commission.

## What it shows

- Summary: stations open, closed and not started; turnout so far; alerts; open incidents; devices online / offline / unknown; sync failures.
- Per station: poll status, turnout, queue with wait estimate (or "stale"), **device connectivity** with last heartbeat time, records waiting to sync, package version, cases and incidents, last sector-officer visit, alerts.
- Filters: State, district, constituency; with alerts; poll status; devices offline or missing; records waiting to sync.
- Latest updates: the most recent operational events.
- Incidents with their timeline.

## Live updates

Operational events (see the list in `services/events.service.js`) are written in the same transaction as the change and published on the Redis channel `eciweb:events`. On a long-running server, Socket.IO delivers each event only to sockets whose assignments cover its jurisdiction; assignments are reloaded every minute so a revoked assignment stops the feed. The browser treats a message as a hint and reloads the data from the API; after reconnecting it fetches what it missed from `GET /events?since=`. Without Socket.IO (Vercel, blocked WebSockets, `REALTIME=off`) the page refreshes every 10 seconds. Events never contain who voted.

## Device connectivity

A station is "online" only when one of its registered devices sent a heartbeat (`POST /devices/heartbeat`, every 30 s) signed with the device secret by a signed-in member of that station's polling party.

| Status | Meaning |
| --- | --- |
| online | heartbeat within 2 minutes, nothing waiting |
| syncing | heartbeat within 2 minutes, records waiting in the outbox |
| sync failed | the last sync reported an error |
| no heartbeat (stale) | last heartbeat 2–10 minutes ago |
| offline | last heartbeat more than 10 minutes ago |
| no device (unknown) | no registered device has reported |

`STATION_ONLINE` is recorded when a device comes back; `STATION_OFFLINE` once per outage, by a sweep that runs every minute on a long-running server and on every control-room load (so it also works on serverless hosting). A device can be revoked by the presiding officer or an official covering the station, with a reason.

## Incidents and escalation

Reported at the station with type and severity. High and critical incidents start with the Returning Officer; others with the sector officer. Officials with `incident:manage` acknowledge, add updates, **escalate** one level at a time (sector officer → Returning Officer → District Election Officer → Chief Electoral Officer, reason required) and resolve (reason required). Each step is audited and emits an event.

## Alerts

Computed from the station state: poll not opened 30 minutes after the start time (`POLL_START_IST`, default 07:00), no queue report in the last hour, a doubt or challenge waiting more than 30 minutes, a high or critical incident unresolved.
