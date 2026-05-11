# Repair Pricing Reference

This is a starter reference file, not an official price list. Confirm real prices with VNS management, suppliers, receipts, and mechanics before using values for accounting.

## Purpose

Use this file to help future AI tools classify and estimate repair costs while building forms, dashboards, and reports.

## Pricing Rule

Never treat estimated prices as final. Always label estimates clearly and allow actual cost entry.

## Starter Cost Buckets

### Small Repair

Typical range: PHP 0 - PHP 5,000

Examples:

- Bulb replacement
- Minor electrical check
- Simple hose replacement
- Basic labor-only fix
- Small hardware or consumables

### Medium Repair

Typical range: PHP 5,001 - PHP 25,000

Examples:

- Brake service
- Tire-related repair
- Battery replacement
- Alternator or starter repair
- Suspension component replacement
- Preventive maintenance with parts

### Major Repair

Typical range: PHP 25,001 and above

Examples:

- Engine repair
- Transmission repair
- Major underchassis work
- Multiple tire replacement
- Accident/body repair
- Major outside shop repair

## Cost Components

Track costs separately when possible:

- Parts cost
- Labor cost
- Outside shop cost
- Towing cost
- Consumables
- Miscellaneous cost
- Total cost

## Parts Cost Notes

If the part comes from inventory:

- Record the inventory item name.
- Record quantity used.
- Link to parts-out movement if available.
- Use inventory unit cost when calculating estimated repair cost.

If the part is purchased externally:

- Record supplier.
- Record receipt number.
- Record purchase date.
- Attach or reference receipt if the system later supports attachments.

## Approval Starter Thresholds

Suggested starter thresholds:

- PHP 0 - PHP 5,000: can be marked as small repair
- PHP 5,001 - PHP 25,000: manager review recommended
- Above PHP 25,000: management approval required

These are placeholders. Replace with VNS-approved thresholds.

## Reporting Ideas

Useful reports:

- Repair cost by truck
- Repair cost by month
- Repair cost by category
- Trucks with repeated repairs
- Parts most often used
- Downtime by truck
- Outside shop spending

## AI Instructions

When AI summarizes repair costs:

- Separate estimated cost from actual cost.
- Do not invent receipt amounts.
- Flag missing supplier, receipt, or approval details.
- Highlight unusually high costs for review.
