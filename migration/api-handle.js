import { EnumerationWriter } from '@dustjs/skylink'

function nullIfNotFound(err) {
  if (err.message.includes('Path not found')) return null; // @dustjs/backend-firebase
  if (err.message.includes(`wasn't Ok, and no error`)) return null; // legacy golang
  throw err;
}

export class ApiHandle {
  constructor(api, path) {
    Object.defineProperties(this, {
      api:  { value: api,  enumerable: false },
      path: { value: path, enumerable: true  },
    });
  }

  subPath(path) {
    // TODO: use PathFragment
    if (!path.startsWith('/')) throw new Error(
      `BUG: must use absolute paths when pathing an ApiHandle`);
    return new ApiHandle(this.api, this.path + path);
  }

  enumerateChildren({ Depth=1 }={}) { return this.api
    .performOperation({ Op: 'enumerate', Path: this.path, Depth })
    .then(x => x.Children.filter(x => x.Name))
    .catch(nullIfNotFound); }

  enumerateToLiteral({ Depth=1 }={}) { return this.api
    .performOperation({ Op: 'enumerate', Path: this.path, Depth })
    .then(enumLit => {
      const enumer = new EnumerationWriter(Depth);
      enumer.visitEnumeration(enumLit);
      return enumer.reconstruct();
    }); }

  readString() { return this.api
    .performOperation({ Op: 'get', Path: this.path })
    .then(x => (x && x.Type === 'String') ? (x.StringValue || '') : null)
    .catch(nullIfNotFound); }

  storeString(StringValue='') { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: { Type: 'String', StringValue },
    }); }
  storeFolder(Children=[]) { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: { Type: 'Folder', Children },
    }); }
  storeLiteral(literal) { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: literal,
    }); }

}
