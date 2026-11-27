import Quill from 'quill';
import deleteTableIcon from 'quill/assets/icons/table-delete-cells.svg?raw';
import deleteColumnIcon from 'quill/assets/icons/table-delete-columns.svg?raw';
import deleteRowIcon from 'quill/assets/icons/table-delete-rows.svg?raw';
import insertColumnIcon from 'quill/assets/icons/table-insert-columns.svg?raw';
import insertRowIcon from 'quill/assets/icons/table-insert-rows.svg?raw';

let registered = false;

/**
 * Gives the document toolbar's table buttons icons. Quill ships these SVGs
 * but only registers the plain "table" one; the toolbar looks icons up by
 * button name, so the rest are added to its registry once.
 */
export function registerTableIcons(): void {
  if (registered) return;
  const icons = Quill.import('ui/icons') as Record<string, unknown>;
  icons['table-row'] = insertRowIcon;
  icons['table-column'] = insertColumnIcon;
  icons['table-row-delete'] = deleteRowIcon;
  icons['table-column-delete'] = deleteColumnIcon;
  icons['table-delete'] = deleteTableIcon;
  registered = true;
}
