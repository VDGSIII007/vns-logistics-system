# Repair System Rules

This file defines starter rules for the VNS repair and maintenance module.

## Purpose

The repair system should track truck issues from report to completion. It should help management see which trucks are down, what repairs cost, who handled them, and whether parts were used from inventory.

## Core Record Fields

Each repair request should eventually track:

- Repair request ID
- Date reported
- Time reported
- Reported by
- Plate number
- Truck type
- Driver name
- Odometer reading
- Issue category
- Issue description
- Priority
- Current status
- Assigned mechanic or shop
- Parts needed
- Parts used
- Labor cost
- Parts cost
- Outside shop cost
- Total cost
- Start date
- Completion date
- Downtime days
- Approval status
- Approved by
- Final remarks

## Suggested Status Flow

Use a simple status flow:

1. New
2. For inspection
3. Waiting for approval
4. Approved
5. In progress
6. Waiting for parts
7. For testing
8. Completed
9. Cancelled

Do not delete completed or cancelled repair records. Keep them for history.

## Priority Levels

- Critical - truck cannot operate or safety issue
- High - affects dispatch or may cause breakdown
- Medium - should be fixed soon
- Low - minor issue or scheduled maintenance

## Repair Categories

Starter categories:

- Engine
- Transmission
- Brakes
- Suspension
- Electrical
- Tires
- Battery
- Cooling system
- Aircon
- Body repair
- Lights
- Preventive maintenance
- GPS / tracker issue
- Documents / compliance
- Other

## Cost Rules

- Total cost should include parts, labor, outside shop charges, towing, and other related costs.
- If parts come from inventory, the repair record should reference the parts-out movement.
- If the final cost changes, keep remarks explaining why.
- Do not overwrite historical costs without an audit note when a backend exists.

## Approval Rules

Repairs above a management-defined threshold should require approval before work begins, unless it is an emergency safety repair.

Starter threshold placeholder:

- Repairs above PHP 5,000 require approval.
- Emergency repairs may proceed but must be tagged and reviewed.

## Completion Rules

A repair should not be marked Completed unless:

- Work performed is described.
- Final cost is entered or marked as not applicable.
- Mechanic/shop is recorded.
- Completion date is entered.
- Road test or inspection result is recorded if needed.

## Integration Notes

Repair records should connect with:

- Parts inventory for parts used
- Cash/expenses module for repair payments
- GPS/iTrackCare notes if the issue is tracker-related
- Payroll only if repair downtime affects driver/helper pay
