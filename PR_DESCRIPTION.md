## Diff Strategy

The action computes a diff between the original product data and the current form state using `computeDiff()`.

Tracked changes:
- Core fields (title, vendor, product type, description, status, tags)
- SKU
- Sibling product handles

## Mutation Decision Matrix

| Condition | Mutation Fired |
|------------|---------------|
| Core fields changed only | productUpdate |
| SKU changed only | variantsBulkUpdate |
| Core fields + SKU changed | productUpdate + variantsBulkUpdate |
| Sibling handles changed only | metafieldsSet |
| Nothing changed | No mutation (no-op save) |

## Notes

- SKU uniqueness is validated before any mutation executes.
- Tags are trimmed, lowercased, and deduplicated before persistence.
- Siblings are lazy-loaded from the `codem.sibling_products` metafield.
- Save is skipped when no changes are detected.
