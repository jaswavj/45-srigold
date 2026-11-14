import { routerPathNames } from '../../routes/routerPathNames';

export interface MenuItemConfig {
  id: string;
  name: string;
  url?: string;
  icon: string;
  moduleId?: number;
  submenus?: MenuItemConfig[];
}

/** user_modules IDs / access codes — a menu shows only if the user has that module. */
export const MENU_MODULE = {
  billing: 1,
  list: 2,
  master: 3,
  statistics: 4,
  customerDetails: 5,
  admin: 6,
  expense: 7,
} as const;

export const filterMenuByModules = (items: MenuItemConfig[], moduleIds: number[]): MenuItemConfig[] => {
  const allowed = new Set((moduleIds || []).map(Number));
  const visible = (item: MenuItemConfig): MenuItemConfig | null => {
    const kids = (item.submenus || []).map(visible).filter(Boolean) as MenuItemConfig[];
    if (kids.length) {
      return { ...item, submenus: kids };
    }
    const selfOk = item.moduleId == null || allowed.has(item.moduleId);
    if (selfOk && (item.url || !item.submenus)) {
      return { ...item, submenus: undefined };
    }
    return null;
  };
  return items.map(visible).filter(Boolean) as MenuItemConfig[];
};

export const hasModuleAccess = (moduleIds: number[] | undefined, moduleId: number): boolean =>
  (moduleIds || []).map(Number).includes(moduleId);

/** After login: statistics home first when allowed, otherwise the billing screen. */
export const defaultAppPath = (moduleIds: number[] | undefined): string =>
  hasModuleAccess(moduleIds, MENU_MODULE.statistics)
    ? routerPathNames.dashboard
    : routerPathNames.billing;

export const moduleIdForPath = (pathname: string): number | null => {
  if (pathname.includes('/app/billing/list')) return MENU_MODULE.list;
  if (pathname.includes('/app/billing')) return MENU_MODULE.billing;
  if (pathname.includes('/app/master')) return MENU_MODULE.master;
  if (pathname.includes('/app/users/change-password')) return null;
  if (pathname.includes('/app/users')) return MENU_MODULE.admin;
  if (pathname.includes('/app/admin')) return MENU_MODULE.admin;
  if (pathname.includes('/app/dashboard') || pathname.includes('/app/statistics')) return MENU_MODULE.statistics;
  if (pathname.includes('/app/credit')) return MENU_MODULE.customerDetails;
  if (pathname.includes('/app/expense')) return MENU_MODULE.expense;
  return null;
};

export const billingMenuConfig: MenuItemConfig[] = [
  {
    id: 'billing',
    name: 'Billing',
    icon: 'fas fa-file-invoice',
    moduleId: MENU_MODULE.billing,
    url: routerPathNames.billing,
  },
  {
    id: 'billing-list',
    name: 'List',
    icon: 'fas fa-list',
    moduleId: MENU_MODULE.list,
    url: routerPathNames.billingList,
  },
  {
    id: 'master',
    name: 'Master',
    icon: 'fas fa-box',
    moduleId: MENU_MODULE.master,
    submenus: [
      { id: 'category', name: 'Category', url: routerPathNames.master.category, moduleId: MENU_MODULE.master, icon: 'fas fa-layer-group' },
      { id: 'product', name: 'Product', url: routerPathNames.master.product, moduleId: MENU_MODULE.master, icon: 'fas fa-cube' },
      { id: 'customers', name: 'Customers', url: routerPathNames.master.customers, moduleId: MENU_MODULE.master, icon: 'fas fa-users' },
    ],
  },
  {
    id: 'customer-details',
    name: 'Customer Details',
    icon: 'fas fa-wallet',
    moduleId: MENU_MODULE.customerDetails,
    url: routerPathNames.credit.customerBalance,
  },
  {
    id: 'admin',
    name: 'Admin',
    icon: 'fas fa-chart-pie',
    moduleId: MENU_MODULE.admin,
    submenus: [
      { id: 'company-details', name: 'Company Details', url: routerPathNames.admin.companyDetails, moduleId: MENU_MODULE.admin, icon: 'fas fa-building' },
      { id: 'create-user', name: 'Create User', url: routerPathNames.users.create, moduleId: MENU_MODULE.admin, icon: 'fas fa-user-plus' },
      { id: 'permission', name: 'Module Permission', url: routerPathNames.users.permission, moduleId: MENU_MODULE.admin, icon: 'fas fa-key' },
    ],
  },
  {
    id: 'expense',
    name: 'Expense',
    icon: 'fas fa-money-bill-wave',
    moduleId: MENU_MODULE.expense,
    submenus: [
      { id: 'expense-type', name: 'Expense Type', url: routerPathNames.expense.type, moduleId: MENU_MODULE.expense, icon: 'fas fa-tags' },
      { id: 'expense-entry', name: 'Expense Entry', url: routerPathNames.expense.entry, moduleId: MENU_MODULE.expense, icon: 'fas fa-receipt' },
      { id: 'expense-report', name: 'Expense Report', url: routerPathNames.expense.report, moduleId: MENU_MODULE.expense, icon: 'fas fa-chart-line' },
    ],
  },
];
