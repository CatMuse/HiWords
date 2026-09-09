# HiWords card types

HiWords schema version 2 stores one knowledge-card type per `.hiwords` collection.

Older `.hiwords` schema versions are not automatically migrated. Unsupported files remain unchanged and need conversion before the structured editor can use them.

The collection declares a namespaced `cardKind` and `cardKindVersion`. Every card in that file has a stable `id`, a `title`, optional aliases/tags, and data matching the collection type.

Built-in kinds:

- `language.word`: language, pronunciation, meanings, examples, forms, morphology, usage and word relations.
- `knowledge.person`: biography, life dates, occupations, timeline, achievements, works and related people.
- `knowledge.concept`: domain, definition, explanation, principles, examples, misconceptions and concept relations.
- `knowledge.custom`: a blank low-code card whose fields are defined by the `.hiwords` collection.

Custom fields support single-line text, long text, numbers, dates, checkboxes, text lists, URLs, and configurable images. Image fields can be single or multiple and define cover/gallery rendering, aspect ratio, and crop behavior.

Field values must match their declared types. A field's type is locked while any card (including an AI draft) has a stored value for it; clear those values before changing the type. Invalid field values are rejected when loading a collection, without rewriting the original file.

Every collection may also declare `fields`. These low-code fields are appended to the built-in template and are shared by every card in the file. Supported field types are single-line text, long text, number, date, checkbox, text list and URL. Field IDs are stable; labels, descriptions, validation, search behavior and default preview visibility are editable in the UI.

The runtime definitions live in `src/knowledge/card-type-registry.ts`. A card type definition owns its label, creation factory, editor module order, display sections, default preview fields, content detection, search projection and capabilities. Type-specific editor and section renderer implementations live under `src/ui/` and are selected by the collection's `cardKind`.

The collection's `display.moduleOrder` is the canonical section order for the editor, preview, popover, sidebar and vocabulary library. Vocabulary-library display settings decide whether a section appears in the compact preview or full details, and whether it is hidden; they do not create a second section order.

Each editor module maps to at most one top-level rendered section. Multiple fields inside a module render as content or subsections of that section. `Basic` is the explicit heading-free metadata module; headings are never hidden based on DOM position. Module labels and descriptions are owned by the card type registry and reused by the editor outline and display settings.

## Adding a built-in type

1. Add a namespaced kind and card data interface in `src/schema/hiwords.ts`.
2. Add its runtime validation to `isHiWordsCard` and `validateHiWordsPack`.
3. Register its factory, editor modules, display-section metadata, search projection and capabilities in the card type registry.
4. Add editor sections and section renderers for popover and sidebar surfaces.
5. Project it to a `WordDefinition` compatibility view in `HiWordsParser` until the legacy Canvas vocabulary pipeline is replaced.
6. Add a valid single-type example to the test vault, outside `.obsidian/plugins/hi-words/`, and run `npm run build`.

Non-language cards do not play pronunciation. Every card in an enabled collection participates in document highlighting; when the mastered feature is enabled, mastered cards are excluded from the highlight index until they are marked as learning again.
