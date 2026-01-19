# Lookup Types

This document lists all lookup types used in the Strakly application.

## Lookup Types Table

| Code | Name | Description |
|------|------|-------------|
| USER_ROLE | User Role | Roles for user access control |
| USER_STATUS | User Status | Account status of users |
| GENDER | Gender | Gender options for user profile |
| DAY_OF_WEEK | Day of Week | Days of the week |

## Notes

- Each lookup type has a unique `code` used for programmatic access
- Lookup values are stored in the `lookups` table with reference to their type
- `isActive` flag can be used to soft-delete lookup types
