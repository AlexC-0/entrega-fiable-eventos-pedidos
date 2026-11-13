export class PersistenceNotReady extends Error {
  constructor() { super('Persistencia requerida no preparada.'); this.name = 'PersistenceNotReady'; }
}
