// Mock DOM and globals for Node.js tests
const mockElement = {
  addEventListener: () => {},
  removeEventListener: () => {},
  appendChild: () => {},
  removeChild: () => {},
  querySelector: (selector) => mockElement,
  querySelectorAll: (selector) => [],
  getElementById: (id) => mockElement,
  setAttribute: () => {},
  getAttribute: () => null,
  innerHTML: '',
  textContent: '',
  style: {},
  classList: { add: () => {}, remove: () => {}, contains: () => false },
  content: 'https://mock.supabase.co'
};

global.document = {
  querySelector: (selector) => mockElement,
  querySelectorAll: (selector) => [],
  getElementById: (id) => mockElement,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => mockElement,
  body: mockElement,
  dispatchEvent: () => {}
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { hash: '' }
};

global.CustomEvent = class CustomEvent extends Event {
  constructor(type, eventInitDict) {
    super(type);
  }
};

global.URL = {
  createObjectURL: () => 'blob:mock',
  revokeObjectURL: () => {}
};

global.Blob = class Blob {};
global.FileReader = class FileReader {};
global.XLSX = { utils: { aoa_to_sheet: () => {}, book_new: () => {}, book_append_sheet: () => {}, read: () => ({ SheetNames: [], Sheets: {} }) }, writeFile: () => {} };
