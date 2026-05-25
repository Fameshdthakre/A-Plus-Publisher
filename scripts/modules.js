/**
 * scripts/modules.js
 * ──────────────────────────────────────────────────────────────────────
 * Central registry of all Amazon A+ Content Standard modules.
 *
 * Each entry defines:
 *   id          – Amazon's data-component-id used in the module-picker modal
 *   name        – Human-readable module name (matches Amazon's label)
 *   shortName   – Compact label for UI badges / dropdowns
 *   aiReady     – Whether the module supports AI text generation
 *   category    – Grouping tag: "text", "image_text", "comparison", "specs", "logo"
 *   maxPerDraft – Amazon allows up to 5 modules per A+ draft
 *   thumbnail   – Amazon's preview image URL (from the module-picker modal)
 *   fields      – Ordered array of data fields the module expects
 *                 Each field: { key, label, type, maxLength?, repeat?, group? }
 *                   type: "text" | "textarea" | "image" | "heading" | "boolean" | "spec_row"
 *                   repeat: number of repeated blocks (e.g., 4 image+text blocks)
 *                   group: logical group name for repeated blocks
 *
 * NOTE: Image fields are declared for completeness but the automation engine
 * currently only supports text injection. Image upload automation will be
 * added in a future phase.
 * ──────────────────────────────────────────────────────────────────────
 */

export const MODULE_REGISTRY = [
  {
    id: "launchpad-company-logo",
    name: "Standard Company Logo",
    shortName: "Company Logo",
    aiReady: false,
    category: "logo",
    thumbnail:
      "https://m.media-amazon.com/images/G/01/aplus/600x180._CB1560201888_._SX600_.png",
    fields: [
      {
        key: "logo_image",
        componentId: "companyLogo",
        componentKey: "image",
        label: "Logo Image",
        type: "image",
      },
      {
        key: "logo_image_alt",
        label: "Logo Image Alt Text",
        type: "text",
        maxLength: 100,
      },
    ],
  },
  {
    id: "module-5",
    name: "Standard Comparison Chart",
    shortName: "Comparison Chart",
    aiReady: true,
    category: "comparison",
    thumbnail:
      "https://m.media-amazon.com/images/G/01/aplus-module/basic_shoppable_dog_template._SX600_.png",
    fields: [
      {
        key: "asin",
        componentId: "product-asin-{i}",
        label: "ASIN",
        type: "text",
        maxLength: 10,
        repeat: 6,
        group: "product",
      },
      {
        key: "title",
        componentId: "product-title-{i}",
        label: "Product Title",
        type: "text",
        maxLength: 80,
        repeat: 6,
        group: "product",
      },
      {
        key: "image",
        componentId: "product-image-{i}",
        componentKey: "image",
        label: "Image",
        type: "image",
        repeat: 6,
        group: "product",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
        repeat: 6,
        group: "product",
      },
      {
        key: "highlight",
        componentId: "product-highlight-{i}",
        label: "Highlight Column",
        type: "boolean",
        repeat: 6,
        group: "product",
      },
      {
        key: "show_reviews",
        componentId: "show-reviews",
        label: "Show Reviews",
        type: "boolean",
      },
      {
        key: "show_prices",
        componentId: "show-prices",
        label: "Show Prices",
        type: "boolean",
      },
      {
        key: "show_add_to_cart",
        componentId: "show-add-to-cart",
        label: "Show Add To Cart",
        type: "boolean",
      },
      {
        key: "metric_name",
        componentId: "metric-name-{i}",
        label: "Metric Name",
        type: "text",
        maxLength: 30,
        repeat: 10,
        group: "metric",
      },
      {
        key: "metric_value",
        componentId: "metric-value-{i}-{j}",
        label: "Metric Value",
        type: "text",
        maxLength: 250,
        repeat: 10,
        group: "metric",
      },
    ],
  },
  {
    id: "module-4",
    name: "Standard Four Image & Text",
    shortName: "Four Image & Text",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module4-large-dog._SX600_.jpg",
    fields: [
      {
        key: "heading",
        componentId: "module-title",
        componentKey: "header",
        label: "Module Heading",
        type: "text",
        maxLength: 200,
      },
      {
        key: "image",
        componentId: "block{i}-image",
        componentKey: "image",
        label: "Image",
        type: "image",
        repeat: 4,
        group: "block",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
        repeat: 4,
        group: "block",
      },
      {
        key: "block_head",
        componentId: "block{i}-title",
        componentKey: "header",
        label: "Block Heading",
        type: "text",
        maxLength: 160,
        repeat: 4,
        group: "block",
      },
      {
        key: "block_body",
        componentId: "block{i}-description",
        componentKey: "paragraph",
        label: "Block Body",
        type: "textarea",
        maxLength: 1000,
        repeat: 4,
        group: "block",
      },
    ],
  },
  {
    id: "module-10",
    name: "Standard Four Image/Text Quadrant",
    shortName: "Four Quadrant",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module10-large-dog._SX600_.jpg",
    fields: [
      {
        key: "image",
        componentId: "block{i}-image",
        componentKey: "image",
        label: "Image",
        type: "image",
        repeat: 4,
        group: "quadrant",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
        repeat: 4,
        group: "quadrant",
      },
      {
        key: "block_head",
        componentId: "block{i}-header",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 160,
        repeat: 4,
        group: "quadrant",
      },
      {
        key: "block_body",
        componentId: "block{i}-description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 1000,
        repeat: 4,
        group: "quadrant",
      },
    ],
  },
  {
    id: "module-11",
    name: "Standard Image & Dark Text Overlay",
    shortName: "Dark Text Overlay",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module-11._SX600_.png",
    fields: [
      {
        key: "image",
        componentId: "image",
        componentKey: "image",
        label: "Background Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Background Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "title",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 70,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 300,
      },
    ],
  },
  {
    id: "module-12",
    name: "Standard Image & Light Text Overlay",
    shortName: "Light Text Overlay",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module-12._SX600_.png",
    fields: [
      {
        key: "image",
        componentId: "image",
        componentKey: "image",
        label: "Background Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Background Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "title",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 70,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 300,
      },
    ],
  },
  {
    id: "3p-module-b",
    name: "Standard Image Header With Text",
    shortName: "Image Header + Text",
    aiReady: false,
    category: "image_text",
    thumbnail:
      "https://m.media-amazon.com/images/G/01/aplus-module/3p-module-b._CB1526416193_._SX600_.png",
    fields: [
      {
        key: "heading_top",
        componentId: "header-top",
        componentKey: "header",
        label: "Top Headline",
        type: "text",
        maxLength: 150,
      },
      {
        key: "image",
        componentId: "main-image",
        componentKey: "image",
        label: "Header Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Header Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "header",
        componentKey: "header",
        label: "Bottom Headline",
        type: "text",
        maxLength: 150,
      },
      {
        key: "body",
        componentId: "text",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 6000,
      },
    ],
  },
  {
    id: "module-6",
    name: "Standard Multiple Image Module A",
    shortName: "Multiple Images",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://m.media-amazon.com/images/S/aplus-media/sota/2e885ae4-b708-4caa-8757-72175c017967._SX600_.png",
    fields: [
      {
        key: "heading",
        componentId: "title1",
        componentKey: "header",
        label: "Module Heading",
        type: "text",
        maxLength: 160,
      },
      {
        key: "body",
        componentId: "description1",
        componentKey: "paragraph",
        label: "Module Body",
        type: "textarea",
        maxLength: 1000,
      },
      {
        key: "image",
        componentId: "image{i}",
        componentKey: "image",
        label: "Image",
        type: "image",
        repeat: 4,
        group: "image_block",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
        repeat: 4,
        group: "image_block",
      },
      {
        key: "image_head",
        componentId: "caption{i}",
        componentKey: "header",
        label: "Image Caption",
        type: "text",
        maxLength: 200,
        repeat: 4,
        group: "image_block",
      },
    ],
  },
  {
    id: "launchpad-brand-description-left",
    name: "Standard Product Description Text",
    shortName: "Product Description",
    aiReady: false,
    category: "text",
    thumbnail:
      "https://m.media-amazon.com/images/G/01/aplus/left-aligned-text._CB1560201807_._SX600_.png",
    fields: [
      {
        key: "body",
        componentId: "body",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 6000,
      },
    ],
  },
  {
    id: "module-8",
    name: "Standard Single Image & Highlights",
    shortName: "Image & Highlights",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module8-large-dog._SX600_.jpg",
    fields: [
      {
        key: "image",
        componentId: "main-image",
        componentKey: "image",
        label: "Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "header",
        componentKey: "header",
        label: "Headline",
        type: "text",
        maxLength: 160,
      },
      {
        key: "subhead_1",
        componentId: "description-subheader1",
        componentKey: "header",
        label: "Subheadline 1",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_1",
        componentId: "description1",
        componentKey: "paragraph",
        label: "Body text 1",
        type: "textarea",
        maxLength: 1000,
      },
      {
        key: "subhead_2",
        componentId: "description-subheader2",
        componentKey: "header",
        label: "Subheadline 2",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_2",
        componentId: "description2",
        componentKey: "paragraph",
        label: "Body text 2",
        type: "textarea",
        maxLength: 400,
      },
      {
        key: "subhead_3",
        componentId: "description-subheader3",
        componentKey: "header",
        label: "Subheadline 3",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_3",
        componentId: "description3",
        componentKey: "paragraph",
        label: "Body text 3",
        type: "textarea",
        maxLength: 400,
      },
      {
        key: "heading_2",
        componentId: "techspecs-header",
        componentKey: "header",
        label: "Headline 2",
        type: "text",
        maxLength: 160,
      },
      {
        key: "bullet",
        componentId: "list",
        componentKey: "list",
        label: "Bullet Point Text",
        type: "list",
        maxLength: 100,
      },
    ],
  },
  {
    id: "module-1",
    name: "Standard Single Image & Sidebar",
    shortName: "Image & Sidebar",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module1-large-dog._SX600_.jpg",
    fields: [
      {
        key: "image",
        componentId: "main-image",
        componentKey: "image",
        label: "Main Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Main Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "image_caption",
        componentId: "main-image-caption",
        componentKey: "header",
        label: "Image Caption",
        type: "text",
        maxLength: 200,
      },
      {
        key: "heading",
        componentId: "header",
        componentKey: "header",
        label: "Headline",
        type: "text",
        maxLength: 160,
      },
      {
        key: "subhead",
        componentId: "sub-header",
        componentKey: "header",
        label: "Subheadline",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body text",
        type: "textarea",
        maxLength: 500,
      },
      {
        key: "bullet",
        componentId: "list",
        componentKey: "list",
        label: "Bullet Point Text",
        type: "list",
        maxLength: 200,
      },
      {
        key: "sidebar_image",
        componentId: "about-image",
        componentKey: "image",
        label: "Sidebar Image",
        type: "image",
      },
      {
        key: "sidebar_image_alt",
        label: "Sidebar Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "sidebar_heading",
        componentId: "about-header",
        componentKey: "header",
        label: "Sidebar Headline",
        type: "text",
        maxLength: 200,
      },
      {
        key: "sidebar_body",
        componentId: "about-description",
        componentKey: "paragraph",
        label: "Sidebar Body text",
        type: "textarea",
        maxLength: 500,
      },
      {
        key: "sidebar_bullet",
        componentId: "list2",
        componentKey: "list",
        label: "Sidebar Bullet Point",
        type: "list",
        maxLength: 200,
      },
    ],
  },
  {
    id: "module-7",
    name: "Standard Single Image & Specs Detail",
    shortName: "Image & Specs",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module7-large-dog._SX600_.jpg",
    fields: [
      {
        key: "heading_1",
        componentId: "header",
        componentKey: "header",
        label: "Headline 1",
        type: "text",
        maxLength: 200,
      },
      {
        key: "image",
        componentId: "main-image",
        componentKey: "image",
        label: "Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading_2",
        componentId: "description-header",
        componentKey: "header",
        label: "Headline 2",
        type: "text",
        maxLength: 160,
      },
      {
        key: "subhead_1",
        componentId: "description-subheader1",
        componentKey: "header",
        label: "Subheadline 1",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_1",
        componentId: "description1",
        componentKey: "paragraph",
        label: "Body text 1",
        type: "textarea",
        maxLength: 400,
      },
      {
        key: "subhead_2",
        componentId: "description-subheader2",
        componentKey: "header",
        label: "Subheadline 2",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_2",
        componentId: "description2",
        componentKey: "paragraph",
        label: "Body text 2",
        type: "textarea",
        maxLength: 600,
      },
      {
        key: "heading_3",
        componentId: "techspecs-header",
        componentKey: "header",
        label: "Headline 3",
        type: "text",
        maxLength: 160,
      },
      {
        key: "subhead_3",
        componentId: "techspecs-list-subheader",
        componentKey: "header",
        label: "Subheadline 3",
        type: "text",
        maxLength: 200,
      },
      {
        key: "bullet",
        componentId: "list",
        componentKey: "list",
        label: "Bullet Point",
        type: "list",
        maxLength: 100,
      },
      {
        key: "subhead_4",
        componentId: "techspecs-subheader1",
        componentKey: "header",
        label: "Subheadline 4",
        type: "text",
        maxLength: 200,
      },
      {
        key: "body_3",
        componentId: "techspecs-description1",
        componentKey: "paragraph",
        label: "Body text 3",
        type: "textarea",
        maxLength: 1000,
      },
    ],
  },
  {
    id: "module-2",
    name: "Standard Single Left Image",
    shortName: "Left Image",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module2-large-dog._SX600_.jpg",
    fields: [
      {
        key: "image",
        componentId: "image",
        componentKey: "image",
        label: "Left Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Left Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "title",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 160,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 1000,
      },
    ],
  },
  {
    id: "module-3",
    name: "Standard Single Right Image",
    shortName: "Right Image",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module3-large-dog._SX600_.jpg",
    fields: [
      {
        key: "image",
        componentId: "image",
        componentKey: "image",
        label: "Right Image",
        type: "image",
      },
      {
        key: "image_alt",
        label: "Right Image Alt Text",
        type: "text",
        maxLength: 100,
      },
      {
        key: "heading",
        componentId: "title",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 160,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 1000,
      },
    ],
  },
  {
    id: "module-16-tech-specs",
    name: "Standard Technical Specifications",
    shortName: "Tech Specs",
    aiReady: false,
    category: "specs",
    thumbnail:
      "https://m.media-amazon.com/images/S/aplus-media/sota/319d5321-c149-4af9-b681-bee3793695e3._SX600_.png",
    fields: [
      {
        key: "heading",
        componentId: "tech-specs-heading",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 80,
      },
      {
        key: "spec_collection",
        componentId: "tech-specs",
        componentKey: "collection",
        label: "Tech Specs Collection",
        type: "collection",
      },
      {
        key: "spec_label",
        componentId: "spec-key",
        componentKey: "header",
        label: "Specification",
        type: "text",
        maxLength: 30,
        repeat: 16,
        group: "spec",
      },
      {
        key: "spec_value",
        componentId: "spec-value",
        componentKey: "header",
        label: "Definition",
        type: "text",
        maxLength: 500,
        repeat: 16,
        group: "spec",
      },
    ],
  },
  {
    id: "module-9",
    name: "Standard Three Images & Text",
    shortName: "Three Images & Text",
    aiReady: true,
    category: "image_text",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/G/01/aplus-module/module9-large-dog._SX600_.jpg",
    fields: [
      {
        key: "heading",
        componentId: "header",
        componentKey: "header",
        label: "Module Heading",
        type: "text",
        maxLength: 200,
      },
      {
        key: "image",
        componentId: "section{i}-image",
        componentKey: "image",
        label: "Image",
        type: "image",
        repeat: 3,
        group: "block",
      },
      {
        key: "image_alt",
        label: "Image Alt Text",
        type: "text",
        maxLength: 100,
        repeat: 3,
        group: "block",
      },
      {
        key: "block_head",
        componentId: "section{i}-header",
        componentKey: "header",
        label: "Block Heading",
        type: "text",
        maxLength: 160,
        repeat: 3,
        group: "block",
      },
      {
        key: "block_body",
        componentId: "description{i}",
        componentKey: "paragraph",
        label: "Block Body",
        type: "textarea",
        maxLength: 1000,
        repeat: 3,
        group: "block",
      },
    ],
  },
  {
    id: "basic-module-13-text",
    name: "Standard Text",
    shortName: "Text",
    aiReady: true,
    category: "text",
    thumbnail:
      "https://m.media-amazon.com/images/G/01/aplusautomation/templates/module-13-text._SX600_.png",
    fields: [
      {
        key: "heading",
        componentId: "heading",
        componentKey: "header",
        label: "Heading",
        type: "text",
        maxLength: 160,
      },
      {
        key: "body",
        componentId: "description",
        componentKey: "paragraph",
        label: "Body Text",
        type: "textarea",
        maxLength: 5000,
      },
    ],
  },
];

// Add default maxPerDraft to registry
MODULE_REGISTRY.forEach((mod) => {
  if (mod.id === "launchpad-company-logo" || mod.id === "module-5") {
    mod.maxPerDraft = 1;
  } else {
    mod.maxPerDraft = 5;
  }
});

// ── Lookup Helpers ─────────────────────────────────────────────────────

/** Map of module id → module config for O(1) lookup */
export const MODULE_MAP = Object.freeze(
  MODULE_REGISTRY.reduce((map, mod) => {
    map[mod.id] = mod;
    return map;
  }, {}),
);

/** Get a module config by its Amazon data-component-id */
export function getModuleById(id) {
  return MODULE_MAP[id] || null;
}

/** Get all modules that support AI text generation */
export function getAIReadyModules() {
  return MODULE_REGISTRY.filter((m) => m.aiReady);
}

/** Get only the text-injectable fields (excludes image fields) for a module */
export function getTextFields(moduleId) {
  const mod = getModuleById(moduleId);
  if (!mod) return [];
  return mod.fields.filter((f) => f.type !== "image");
}

/**
 * Get the flat list of field labels suitable for an Excel template header row.
 * For repeated fields, it generates numbered labels (e.g., "Block Heading 1", "Block Heading 2").
 */
export function getTemplateHeaders(moduleId) {
  const mod = getModuleById(moduleId);
  if (!mod) return [];
  const headers = [];
  for (const field of mod.fields) {
    if (field.repeat && field.repeat > 1) {
      for (let i = 1; i <= field.repeat; i++) {
        headers.push(`${field.label} ${i}`);
      }
    } else {
      headers.push(field.label);
    }
  }
  return headers;
}

/** Amazon enforces a max of 5 modules per A+ draft */
export const MAX_MODULES_PER_DRAFT = 5;
