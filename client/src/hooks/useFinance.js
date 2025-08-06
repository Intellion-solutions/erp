import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useFinance() {
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  // Fetch all finance data
  const fetchFinanceData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, journalsRes, txRes, currRes, exRes, apprRes] = await Promise.all([
        fetch('/api/accounting/accounts').then(r => r.json()),
        fetch('/api/accounting/journal-entries').then(r => r.json()),
        fetch('/api/accounting/transactions').then(r => r.json()),
        fetch('/api/accounting/currencies').then(r => r.json()),
        fetch('/api/accounting/exchange-rates').then(r => r.json()),
        fetch('/api/accounting/approvals').then(r => r.json()),
      ]);
      setAccounts(accountsRes);
      setJournalEntries(journalsRes);
      setTransactions(txRes);
      setCurrencies(currRes);
      setExchangeRates(exRes);
      setApprovals(apprRes);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFinanceData();
    if (socket) {
      socket.on('financeDashboardUpdated', fetchFinanceData);
    }
    return () => {
      if (socket) {
        socket.off('financeDashboardUpdated', fetchFinanceData);
      }
    };
  }, [fetchFinanceData, socket]);

  // CRUD methods
  const createAccount = async (data) => {
    const res = await fetch('/api/accounting/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create account');
    await fetchFinanceData();
  };

  const createJournalEntry = async (data) => {
    const res = await fetch('/api/accounting/journal-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create journal entry');
    await fetchFinanceData();
  };

  const createTransaction = async (data) => {
    const res = await fetch('/api/accounting/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create transaction');
    await fetchFinanceData();
  };

  const getFinancialReports = async () => {
    const res = await fetch('/api/accounting/reports');
    if (!res.ok) throw new Error('Failed to fetch reports');
    return await res.json();
  };

  return {
    accounts,
    journalEntries,
    transactions,
    currencies,
    exchangeRates,
    approvals,
    loading,
    error,
    createAccount,
    createJournalEntry,
    createTransaction,
    getFinancialReports
  };
}