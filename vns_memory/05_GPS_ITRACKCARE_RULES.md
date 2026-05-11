# GPS / iTrackCare Rules

This file captures starter rules for GPS and iTrackCare-related workflows.

## Purpose

GPS data helps VNS monitor fleet movement, truck status, route activity, and possible operational issues. The system should treat GPS information as sensitive internal data.

## Sensitive GPS Data

Do not expose the following publicly:

- Live truck location
- Driver location history
- Client delivery routes
- Stop locations
- GPS screenshots with private details
- Login credentials or tokens

## Common GPS Statuses

Starter status values:

- Online
- Offline
- Moving
- Parked
- Idle
- No signal
- GPS disconnected
- Device issue
- Suspected tampering
- Under repair
- Resolved

## GPS Issue Categories

- No signal
- Delayed update
- Wrong location
- Device offline
- Power disconnected
- SIM/load issue
- Antenna/device damage
- App/login issue
- iTrackCare account issue
- Other

## GPS Repair Workflow

If GPS issue affects a truck:

1. Record plate number.
2. Record date/time issue was noticed.
3. Record last known GPS status.
4. Record screenshot or note if available.
5. Check if truck is physically operating.
6. Assign staff or technician.
7. Mark status as Under repair or Monitoring.
8. Confirm GPS is updating again before marking Resolved.

## iTrackCare Notes

When documenting iTrackCare information:

- Use plate number as the main lookup key.
- Record exact date/time of GPS observation.
- Do not paste passwords or private tokens into code or docs.
- Do not commit screenshots containing private location data unless explicitly approved.

## Integration Ideas

GPS status may connect with:

- Dispatch status
- Repair module for GPS device issues
- Driver/truck activity reports
- Client reporting if management approves
- Payroll only if GPS is used to verify trips or attendance

## AI Instructions

Future AI tools should:

- Treat GPS records as private.
- Avoid guessing locations.
- Use clear confidence labels if data is incomplete.
- Flag trucks with repeated GPS issues.
- Preserve plate number formatting exactly as entered unless normalization rules are defined.
