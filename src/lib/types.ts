export type AccountType = 'current' | 'savings' | 'credit' | 'investment' | 'cash'

export interface Account {
  id: string
  name: string
  institution: string
  type: AccountType
  balance: number
  source: 'manual' | 'bank' | 'demo'
  external_id: string | null
  connection_id: string | null
  last_synced: string | null
}

export interface Txn {
  id: string
  account_id: string
  date: string // YYYY-MM-DD
  amount: number // negative = money out
  description: string
  category: string // '' = not yet categorised
  notes: string
  source: 'manual' | 'bank' | 'csv' | 'demo' | 'receipt'
  external_id: string | null
}

export type Frequency = 'weekly' | 'fortnightly' | 'four-weekly' | 'monthly' | 'quarterly' | 'yearly'
export type RecurringKind = 'subscription' | 'bill' | 'essential' | 'income'

export interface Recurring {
  id: string
  name: string
  amount: number // always positive
  kind: RecurringKind
  category: string
  frequency: Frequency
  next_due: string
  active: boolean
}

export interface Receipt {
  id: string
  merchant: string
  date: string
  total: number
  category: string
  notes: string
  file_path: string | null
  file_type: string | null
  transaction_id: string | null
}

export interface Budget {
  id: string
  category: string
  monthly_limit: number
}

export interface Goal {
  id: string
  name: string
  target: number
  saved: number
  target_date: string | null
}

export interface Tables {
  accounts: Account[]
  transactions: Txn[]
  recurring: Recurring[]
  receipts: Receipt[]
  budgets: Budget[]
  goals: Goal[]
}

export type TableName = keyof Tables

export const emptyTables = (): Tables => ({
  accounts: [], transactions: [], recurring: [], receipts: [], budgets: [], goals: [],
})

export const TABLE_NAMES: TableName[] = ['accounts', 'transactions', 'recurring', 'receipts', 'budgets', 'goals']
