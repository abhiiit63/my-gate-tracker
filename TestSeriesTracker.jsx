/*
Test Series Tracker - Single-file React component
Place this file in a React project (Create React App / Vite) as `TestSeriesTracker.jsx`.

Dependencies:
  - react, react-dom
  - recharts  (for charts): npm i recharts
  - lucide-react (for icons): npm i lucide-react
  - tailwindcss for styling (optional, component uses Tailwind classes).

Features implemented:
  - Add / edit / delete test entries (Subject, Category, Max Marks, Obtained Marks, Rank, Date, Notes)
  - Live percentage calculation
  - Persistent storage in localStorage (auto-saves)
  - Export/Import JSON & Export CSV
  - Filter by subject and date range, and search
  - Summary: total tests, average percentage, per-subject averages, AVERAGE RANK PERCENTILE
  - Overall Trend chart (Line chart across ALL tests, showing Subject/Category)
  - Performance vs. Subject Chart (Vertical Bar Chart)
  - CORRECT, WRONG, NOT ATTEMPTED COUNTS
  - RANK PERCENTILE TREND OVER TIME (ALL RANKED TESTS, showing Subject/Category)
  - ISOLATED FULL TEST SCORE TREND (Mock/Full Length)
  - TOP 5 WEAKEST SUBJECTS SECTION
  - Custom UI for all alerts and confirmations (no window.alert/confirm)
  - ✨ Gemini API Integration: Generate a personalized study plan based on weak subjects.
  - ✨ NEW: Test Note Expander (Converts short notes into detailed conceptual reminders)
  - Multi-Provider Filter (Ace Academy, PrepFusion, etc.)
*/

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart, 
  Bar,      
} from "recharts";
import { X, CheckCircle, AlertTriangle, Loader, Zap, ClipboardList, TrendingUp, Info, UserCheck, BookOpen } from 'lucide-react'; 

const STORAGE_KEY = "prepfusion_test_series";
const API_KEY = ""; // Canvas will provide this at runtime
const LLM_MODEL = "gemini-2.5-flash-preview-05-20";
// NOTE: Use window.location.origin to simulate the environment providing the key
const LLM_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${API_KEY}`;

// NEW: Test categories
const TEST_CATEGORIES = ["Topic Wise", "Subjectwise", "Multisubject Wise", "Full Length", "Mock"];
const FULL_TEST_CATEGORIES = ["Multisubject Wise", "Full Length", "Mock"]; // Categories for the isolated chart

// NEW: Test Series Providers
const TEST_PROVIDERS = ["Ace Academy", "PrepFusion", "Gate Academy", "Other"];

// Constants for conditional logic
const SUBJECT_REQUIRED_CATEGORIES = ["Topic Wise", "Subjectwise"];
const DEFAULT_MULTI_SUBJECT = "Multi-Subject/Full Test";

// NEW: GATE ECE Subjects List (Updated to include Multi-Subject default)
const ECE_SUBJECTS = [
    "Engineering Mathematics",
    "General Aptitude",
    "Network Theory",
    "Electronic Devices (EDC)",
    "Analog Circuits",
    "Digital Circuits",
    "Control Systems",
    "Electromagnetics (EMT)",
    "Communication Systems",
    "Signals and Systems",
    "Computer Organization & Architecture",
    DEFAULT_MULTI_SUBJECT, // Added for Multi-subject/Full Test categories
    "Other/Unknown"
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatDateInput(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

function csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Simple fetch with retry logic for API calls
const fetchWithRetry = async (url, options, maxRetries = 3) => {
    let error = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                // Try to extract a specific error message from the body
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorJson = await response.json();
                    errorMessage = errorJson.error?.message || errorMessage;
                } catch (e) {
                    // Ignore JSON parsing error if the response wasn't JSON
                }
                throw new Error(errorMessage);
            }
            return response;
        } catch (e) {
            error = e;
            const delay = Math.pow(2, i) * 1000;
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw error;
};

// Custom Toast Alert Component
const ToastAlert = ({ message, type, onClose }) => {
    if (!message) return null;

    const baseClasses = "fixed top-4 right-4 p-4 rounded-lg shadow-2xl flex items-center z-50 transition-transform duration-300 transform";
    let colorClasses = "";
    let Icon = null;

    if (type === 'success') {
        colorClasses = "bg-green-600 text-white";
        Icon = CheckCircle;
    } else if (type === 'error') {
        colorClasses = "bg-red-600 text-white";
        Icon = AlertTriangle;
    }

    useEffect(() => {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); 
      return () => clearTimeout(timer);
    }, [message, onClose]);

    return (
      <div className={`${baseClasses} ${colorClasses}`}>
        {Icon && <Icon size={20} className="mr-2 flex-shrink-0" />}
        <p className="font-semibold text-sm">{message}</p>
        <button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20 transition">
          <X size={16} />
        </button>
      </div>
    );
  };

// Custom Tooltip for Rank Percentile Trend Chart (to show subject/category)
const RankPercentileTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      const isSubjectSpecific = SUBJECT_REQUIRED_CATEGORIES.includes(data.category);
      const identifier = isSubjectSpecific 
        ? `Subject: ${data.subject}` 
        : `Category: ${data.category}`;
        
      return (
        <div className="p-3 bg-white border border-indigo-300 rounded-lg shadow-md text-sm">
          <p className="font-semibold text-gray-700">{`Date: ${label}`}</p>
          <p className="text-gray-600 mt-1">{identifier}</p> 
          <p className="text-pink-600 font-bold">{`Percentile: ${data.rankPercentile}%`}</p>
          <p className="text-gray-500 mt-1">{`Provider: ${data.provider}`}</p>
        </div>
      );
    }
    return null;
  };
  
// Custom Tooltip for Overall Percentage Trend Chart (to show Subject or Category)
const OverallPercentageTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      const isSubjectSpecific = SUBJECT_REQUIRED_CATEGORIES.includes(data.category);
      const identifier = isSubjectSpecific 
        ? `Subject: ${data.subject}` 
        : `Category: ${data.category}`;

      return (
        <div className="p-3 bg-white border border-indigo-300 rounded-lg shadow-md text-sm">
          <p className="font-semibold text-gray-700">{`Date: ${label}`}</p>
          <p className="text-gray-600 mt-1">{identifier}</p>
          <p className="text-indigo-600 font-bold">{`Score: ${data.percentage}%`}</p>
          <p className="text-gray-500 mt-1">{`Provider: ${data.provider}`}</p>
        </div>
      );
    }
    return null;
  };

// Custom Tooltip for Full Test Percentage Trend Chart (to show Category only)
const FullTestPercentageTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 bg-white border border-indigo-300 rounded-lg shadow-md text-sm">
          <p className="font-semibold text-gray-700">{`Date: ${label}`}</p>
          <p className="text-gray-600 mt-1">{`Category: ${data.category}`}</p>
          <p className="text-orange-600 font-bold">{`Score: ${data.percentage}%`}</p>
          <p className="text-gray-500 mt-1">{`Provider: ${data.provider}`}</p>
        </div>
      );
    }
    return null;
  };


export default function TestSeriesTracker() {
  const [tests, setTests] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to parse stored tests", e);
      return [];
    }
  });

  const [form, setForm] = useState({
    id: null,
    subject: ECE_SUBJECTS[0], 
    category: TEST_CATEGORIES[0], 
    provider: TEST_PROVIDERS[0], // NEW: Provider default
    maxMarks: "",
    obtainedMarks: "",
    correctCount: "",     
    incorrectCount: "",   
    notAttemptedCount: "", 
    testRank: "",       
    totalTestTakers: "", 
    date: formatDateInput(new Date()),
    notes: "",
  });

  const [filterProvider, setFilterProvider] = useState("All"); // NEW: Global Provider Filter
  const [filterSubject, setFilterSubject] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  
  // Custom Alert/Confirmation State
  const [toastAlert, setToastAlert] = useState(null); 
  const [confirmModal, setConfirmModal] = useState(null); 

  // Gemini LLM State
  const [llmResult, setLlmResult] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);

  // NEW: State for Note Expander
  const [noteExpandLoading, setNoteExpandLoading] = useState(false);

  // NEW: State for unique key generation
  const [tableKey, setTableKey] = useState(uid());


  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
    // Reset table key whenever tests change to trigger hard reset
    setTableKey(uid());
  }, [tests]);

  // Subjects for the Filter dropdown 
  const subjects = useMemo(() => {
    const s = new Set(tests.map((t) => t.subject || "Unknown"));
    const allSubjects = new Set([...s, ...ECE_SUBJECTS]); 
    return ["All", ...Array.from(allSubjects).sort()];
  }, [tests]);
  
  // Tests filtered by the global provider filter first
  const providerFilteredTests = useMemo(() => {
      if (filterProvider === "All") return tests;
      return tests.filter(t => (t.provider || "Other") === filterProvider);
  }, [tests, filterProvider]);


  function resetForm() {
    setForm({ 
      id: null, 
      subject: ECE_SUBJECTS[0], 
      category: TEST_CATEGORIES[0], 
      provider: TEST_PROVIDERS[0],
      maxMarks: "", 
      obtainedMarks: "", 
      correctCount: "",
      incorrectCount: "",
      notAttemptedCount: "",
      testRank: "",       
      totalTestTakers: "", 
      date: formatDateInput(new Date()), 
      notes: "" 
    });
  }

  function handleAddOrUpdate(e) {
    e.preventDefault();
    setToastAlert(null); 
    
    // Parse as floats for decimal support
    const max = Number(form.maxMarks);
    const obt = Number(form.obtainedMarks);
    
    // Counts remain integers
    const correct = Number(form.correctCount); 
    const incorrect = Number(form.incorrectCount); 
    const notAttempted = Number(form.notAttemptedCount); 
    const rank = Number(form.testRank);
    const totalTakers = Number(form.totalTestTakers);

    const hasRank = form.testRank && form.totalTestTakers; 
    
    // Core Validation
    if (!form.subject.trim()) return setToastAlert({ message: "Please enter subject.", type: 'error' });
    if (!max || max <= 0) return setToastAlert({ message: "Max marks should be a positive number.", type: 'error' });
    if (isNaN(obt) || obt < 0) return setToastAlert({ message: "Obtained marks should be a non-negative number.", type: 'error' });
    if (obt > max) return setToastAlert({ message: "Obtained marks cannot be greater than Max Marks.", type: 'error' });
    
    // NEW COUNT VALIDATION
    if (isNaN(correct) || correct < 0) return setToastAlert({ message: "Correct count must be a non-negative number.", type: 'error' });
    if (isNaN(incorrect) || incorrect < 0) return setToastAlert({ message: "Incorrect count must be a non-negative number.", type: 'error' });
    if (isNaN(notAttempted) || notAttempted < 0) return setToastAlert({ message: "Not Attempted count must be a non-negative number.", type: 'error' });
    
    // Rank Validation
    if (hasRank) {
        if (!rank || rank <= 0) return setToastAlert({ message: "Your Rank must be a positive number.", type: 'error' });
        if (!totalTakers || totalTakers <= 0) return setToastAlert({ message: "Total Test Takers must be a positive number.", type: 'error' });
        if (rank > totalTakers) return setToastAlert({ message: "Your Rank cannot be greater than Total Test Takers.", type: 'error' });
    }

    // Rank Percentile Calculation
    const rankPercentile = hasRank ? Math.round((1 - (rank / totalTakers)) * 10000) / 100 : null;
    
    // Check if counts were entered and if so, save them
    const hasCounts = form.correctCount || form.incorrectCount || form.notAttemptedCount;
    
    const entry = {
      id: form.id || uid(),
      subject: form.subject.trim(),
      category: form.category, 
      provider: form.provider, // NEW: Save provider
      maxMarks: max,
      obtainedMarks: obt,
      percentage: max ? Math.round((obt / max) * 10000) / 100 : 0,
      
      // NEW COUNT FIELDS
      correctCount: hasCounts ? correct : null, 
      incorrectCount: hasCounts ? incorrect : null, 
      notAttemptedCount: hasCounts ? notAttempted : null, 
      
      testRank: hasRank ? rank : null,             
      totalTestTakers: hasRank ? totalTakers : null, 
      rankPercentile: rankPercentile,              
      date: form.date || formatDateInput(new Date()),
      notes: form.notes || "",
    };

    setTests((prev) => {
      const exists = prev.find((p) => p.id === entry.id);
      if (exists) {
        setToastAlert({ message: "Test updated successfully!", type: 'success' });
        return prev.map((p) => (p.id === entry.id ? entry : p));
      }
      setToastAlert({ message: "Test added successfully!", type: 'success' });
      return [entry, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    resetForm();
  }

  function handleEdit(id) {
    const t = tests.find((x) => x.id === id);
    if (!t) return;
    setForm({ 
      id: t.id, 
      subject: t.subject, 
      category: t.category || TEST_CATEGORIES[0], 
      provider: t.provider || TEST_PROVIDERS[0], // Load existing provider
      // Ensure marks are set as string, preserving decimal for display
      maxMarks: String(t.maxMarks), 
      obtainedMarks: String(t.obtainedMarks), 
      correctCount: String(t.correctCount || ""),      
      incorrectCount: String(t.incorrectCount || ""),  
      notAttemptedCount: String(t.notAttemptedCount || ""), 
      testRank: String(t.testRank || ""),       
      totalTestTakers: String(t.totalTestTakers || ""), 
      date: formatDateInput(t.date), 
      notes: t.notes 
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDelete(id) {
    setConfirmModal({
        message: "Are you sure you want to delete this test entry? This cannot be undone.",
        onConfirm: () => {
            setTests((prev) => prev.filter((x) => x.id !== id));
            setToastAlert({ message: "Test deleted.", type: 'success' });
        }
    });
  }

  function handleExportJSON() {
    const dataStr = JSON.stringify(tests, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-series-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportJSON(file) {
    setToastAlert(null); 
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error("Invalid file format. Ensure it's an array of test objects.");
        
        const normalized = data.map((d) => {
            const max = Number(d.maxMarks) || 0;
            const obt = Number(d.obtainedMarks) || 0;
            const rank = Number(d.testRank);
            const totalTakers = Number(d.totalTestTakers);
            const hasRank = rank > 0 && totalTakers > 0 && rank <= totalTakers;

            return {
                id: d.id || uid(),
                subject: d.subject || "Unknown",
                category: d.category || TEST_CATEGORIES[0],
                provider: d.provider || TEST_PROVIDERS[0], // Set default if missing
                maxMarks: max,
                obtainedMarks: obt,
                correctCount: Number(d.correctCount) > 0 ? Number(d.correctCount) : null,
                incorrectCount: Number(d.incorrectCount) > 0 ? Number(d.incorrectCount) : null,
                notAttemptedCount: Number(d.notAttemptedCount) > 0 ? Number(d.notAttemptedCount) : null,
                percentage: max ? Math.round((obt / max) * 10000) / 100 : 0,
                testRank: hasRank ? rank : null,
                totalTestTakers: hasRank ? totalTakers : null,
                rankPercentile: hasRank ? Math.round((1 - (rank / totalTakers)) * 10000) / 100 : null,
                date: d.date || formatDateInput(new Date()),
                notes: d.notes || "",
            };
        });
        setTests((prev) => [...normalized, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
        setToastAlert({ message: "Data imported successfully!", type: 'success' });
      } catch (err) {
        setToastAlert({ message: "Failed to import: " + err.message, type: 'error' });
      }
    };
    reader.readAsText(file);
  }

  function handleExportCSV() {
    // Updated headers to include the new provider field
    const headers = ["subject", "category", "provider", "maxMarks", "obtainedMarks", "correctCount", "incorrectCount", "notAttemptedCount", "percentage", "testRank", "totalTestTakers", "rankPercentile", "date", "notes"];
    const rows = [headers.join(",")];
    for (const t of tests) {
      rows.push(
        [
          t.subject, 
          t.category, 
          t.provider, // Export provider
          t.maxMarks, 
          t.obtainedMarks, 
          t.correctCount || "", 
          t.incorrectCount || "", 
          t.notAttemptedCount || "", 
          t.percentage, 
          t.testRank || "", 
          t.totalTestTakers || "", 
          t.rankPercentile || "", 
          t.date, 
          t.notes
        ].map(csvEscape).join(",")
      );
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-series-data.csv";
    URL.revokeObjectURL(url);
    a.click();
  }

  // Use providerFilteredTests as the base for all subsequent filtering and analysis
  const filtered = useMemo(() => {
    return providerFilteredTests.filter((t) => {
      // NOTE: Provider filter is already applied in providerFilteredTests
      
      if (filterSubject !== "All" && t.subject !== filterSubject) return false;
      if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.date) > new Date(dateTo)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!t.subject.toLowerCase().includes(s) && !(t.notes || "").toLowerCase().includes(s) && !(t.category || "").toLowerCase().includes(s) && !(t.provider || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [providerFilteredTests, filterSubject, dateFrom, dateTo, search]); // Dependency changed

  // Summary and chart data generation based on the currently filtered data
  const summary = useMemo(() => {
    const totalTests = filtered.length;
    const totalPercentageSum = filtered.reduce((a, b) => a + (b.percentage || 0), 0);
    const avg = filtered.length ? Math.round((totalPercentageSum / filtered.length) * 100) / 100 : 0;
    
    // Subject Averages (based on filtered data)
    const bySubject = {};
    for (const t of filtered) {
      if (t.subject === DEFAULT_MULTI_SUBJECT) continue; 
      
      if (!bySubject[t.subject]) bySubject[t.subject] = { sum: 0, count: 0, items: [] };
      bySubject[t.subject].sum += t.percentage;
      bySubject[t.subject].count += 1;
      bySubject[t.subject].items.push(t);
    }
    
    const subjectAverages = Object.entries(bySubject).map(([subject, v]) => ({ 
        subject, 
        avg: Math.round((v.sum / v.count) * 100) / 100, 
        count: v.count, 
        items: v.items 
    })).sort((a, b) => b.avg - a.avg); 

    // Rank Analysis (based on filtered data)
    const rankedTests = filtered.filter(t => t.rankPercentile !== null);
    const totalRankPercentileSum = rankedTests.reduce((a, b) => a + (b.rankPercentile || 0), 0);
    const avgRankPercentile = rankedTests.length ? Math.round((totalRankPercentileSum / rankedTests.length) * 100) / 100 : null;

    return { totalTests, avg, subjectAverages, avgRankPercentile, rankedTestsCount: rankedTests.length };
  }, [filtered]);
  
  // All chart data relies on 'filtered'

  const overallTrendChartData = useMemo(() => {
    const arr = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
    return arr.map((t) => ({ name: t.date, percentage: t.percentage, category: t.category, subject: t.subject, provider: t.provider }));
  }, [filtered]);

  const fullTestChartData = useMemo(() => {
      const arr = filtered
          .filter(t => FULL_TEST_CATEGORIES.includes(t.category))
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      return arr.map((t) => ({ name: t.date, percentage: t.percentage, category: t.category, provider: t.provider }));
  }, [filtered]);

  const rankChartData = useMemo(() => {
    const arr = [...filtered] 
        .filter(t => t.rankPercentile !== null) 
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    return arr.map((t) => ({ 
        name: t.date, 
        rankPercentile: t.rankPercentile, 
        category: t.category,
        subject: t.subject,
        provider: t.provider
    })); 
  }, [filtered]);

  const topWeakestSubjects = useMemo(() => {
      return summary.subjectAverages
          .filter(s => s.avg < 65) 
          .sort((a, b) => a.avg - b.avg) 
          .slice(0, 5); 
  }, [summary.subjectAverages]);

  function handleClearAll() {
    setConfirmModal({
        message: "Are you sure you want to clear all tests? This cannot be undone.",
        onConfirm: () => {
            setTests([]);
            setToastAlert({ message: "All test data cleared.", type: 'success' });
        }
    });
  }
  
  // --- LLM Test Note Expander ---
  async function expandNotes() {
    if (noteExpandLoading) return;
    setToastAlert(null); 
    setNoteExpandLoading(true);

    if (API_KEY === "") {
        setToastAlert({ message: "ERROR: API Key missing. Cannot connect to Note Expander.", type: 'error' });
        setNoteExpandLoading(false);
        return;
    }

    if (!form.notes.trim()) {
        setToastAlert({ message: "Please enter a short note (Mistake/Concept) to expand.", type: 'error' });
        setNoteExpandLoading(false);
        return;
    }

    const systemInstruction = "You are a concise engineering tutor. Expand the user's short note about a conceptual mistake or weakness into a 1-2 paragraph detailed explanation of the core concept and why it's important for GATE ECE. Use markdown formatting. Include 1 specific formula or key term related to the topic.";
    
    const userPrompt = `Expand this note, assuming it relates to GATE ECE: "${form.notes}"`;

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
    };

    try {
        const response = await fetchWithRetry(LLM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const expandedText = result.candidates?.[0]?.content?.parts?.[0]?.text || form.notes + "\n\n[Failed to generate detailed expansion.]";
        
        // Update the form notes with the expanded text
        setForm(prev => ({ ...prev, notes: expandedText }));
        setToastAlert({ message: "Note expanded and saved to the input field!", type: 'success' });

    } catch (error) {
        console.error("LLM Note Expander Error:", error);
        setToastAlert({ message: "Failed to expand note: API connection error.", type: 'error' });
    } finally {
        setNoteExpandLoading(false);
    }
  }


  // --- LLM Study Plan Generation (Uses currently filtered data for analysis) ---

  async function generateStudyPlan() {
    if (llmLoading) return;
    setLlmLoading(true);
    setLlmResult(null);
    setLlmError(null);

    if (API_KEY === "") {
        setLlmError("AI Mentor is not initialized. Please ensure the API key is provided by the execution environment.");
        setLlmLoading(false);
        return;
    }

    const weakSubjectsForLLM = summary.subjectAverages
        .filter(s => ECE_SUBJECTS.includes(s.subject) && s.subject !== DEFAULT_MULTI_SUBJECT)
        .sort((a, b) => a.avg - b.avg) 
        .slice(0, 5) 
        .map(s => `Subject: ${s.subject}, Avg Score: ${s.avg}% (from ${s.count} tests)`)
        .join("\n");

    if (summary.totalTests < 2) {
        setLlmError("Please log at least two tests across different subjects to generate a meaningful study plan.");
        setLlmLoading(false);
        return;
    }

    const providerContext = filterProvider !== "All" ? `(Only analyzing tests from ${filterProvider} Test Series Provider)` : "(Analyzing combined data from all providers)";

    const systemInstruction = "Act as a highly experienced GATE ECE preparation mentor. Your goal is to analyze the student's test performance data (especially low scores) and provide constructive, specific, and actionable advice. The response must be formatted clearly using markdown headers and lists.";
    
    const userPrompt = `Analyze the following weakest GATE ECE subject performance data and provide a personalized study plan focused on the next 7 days. ${providerContext}
    
    The user's average rank percentile is ${summary.avgRankPercentile}% (if available, otherwise ignore).

Weakest Subjects Performance:
${weakSubjectsForLLM}

Based on this data, please provide:
1. A summary of the 3 most critical weak subjects that require immediate attention.
2. A 3-step, highly specific action plan for each of these 3 critical subjects to improve their score.
3. A general tip for improving time management and rank percentile in the next full mock test.`;

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
    };

    try {
        const response = await fetchWithRetry(LLM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate analysis. The AI mentor is busy, please try again.";
        
        setLlmResult(text);
    } catch (error) {
        console.error("LLM API Error:", error);
        setLlmError("Failed to connect to the analysis engine or API: " + error.message);
    } finally {
        setLlmLoading(false);
    }
  }

  // Confirmation Modal Component
  const ConfirmationModal = () => {
    if (!confirmModal) return null;
    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm transform transition-all p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Action</h3>
          <p className="text-gray-700 mb-6">{confirmModal.message}</p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition text-sm font-medium"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-['Inter',sans-serif]">

      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-center justify-between mb-6 border-b pb-4">
          <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-900 flex items-center">
            <TrendingUp size={32} className="mr-3 text-pink-600" />
            GATE ECE Tracker
          </h1>
          <p className="text-sm text-gray-600 mt-2 md:mt-0">Analyze. Adapt. Ace. (Targeting GATE 2026)</p>
        </header>

        {/* Input Form - Refactored to multi-row responsive grid */}
        <form onSubmit={handleAddOrUpdate} className="bg-white p-6 rounded-2xl shadow-2xl mb-8 border border-indigo-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">{form.id ? "Edit Test Entry" : "Add New Test Entry"}</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Row 1: Category, Provider, Subject, Marks */}
            
            {/* Category Dropdown (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Category</label>
              <select 
                value={form.category} 
                onChange={(e) => {
                    const newCategory = e.target.value;
                    const requiresSubject = SUBJECT_REQUIRED_CATEGORIES.includes(newCategory);
                    setForm({ 
                        ...form, 
                        category: newCategory,
                        subject: requiresSubject ? form.subject : DEFAULT_MULTI_SUBJECT 
                    });
                }} 
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
              >
                {TEST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* NEW: Test Series Provider Dropdown (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Test Series Provider</label>
              <select 
                value={form.provider} 
                onChange={(e) => setForm({ ...form, provider: e.target.value })} 
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
              >
                {TEST_PROVIDERS.map((prov) => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>
            
            {/* Subject Field (1/4) */}
            <div className={!SUBJECT_REQUIRED_CATEGORIES.includes(form.category) ? 'opacity-60' : ''}>
              <label className="block text-xs font-medium text-gray-700">Subject</label>
              {SUBJECT_REQUIRED_CATEGORIES.includes(form.category) ? (
                  <select 
                    value={form.subject} 
                    onChange={(e) => setForm({ ...form, subject: e.target.value })} 
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" 
                    required
                  >
                    {ECE_SUBJECTS.filter(s => s !== DEFAULT_MULTI_SUBJECT).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
              ) : (
                  <input 
                      type="text"
                      value={DEFAULT_MULTI_SUBJECT} 
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 cursor-not-allowed shadow-sm" 
                      disabled 
                  />
              )}
            </div>
            
            {/* Obtained Marks (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Obtained Marks</label>
              <input 
                type="text" 
                step="0.01" 
                value={form.obtainedMarks} 
                onChange={(e) => setForm({ ...form, obtainedMarks: e.target.value })} 
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" 
                inputMode="decimal" 
                placeholder="e.g. 25.50"
                required
              />
            </div>
            
            {/* Row 2: Max Marks, Counts */}
            
            {/* Max Marks (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Max Marks</label>
              <input 
                type="text" 
                step="0.01" 
                value={form.maxMarks} 
                onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} 
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" 
                inputMode="decimal" 
                placeholder="e.g. 30.00"
                required
              />
            </div>

            {/* Correct Count (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Correct Count (R)</label>
              <input type="number" value={form.correctCount} onChange={(e) => setForm({ ...form, correctCount: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" min="0" placeholder="e.g. 50" />
            </div>

            {/* Incorrect Count (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Incorrect Count (W)</label>
              <input type="number" value={form.incorrectCount} onChange={(e) => setForm({ ...form, incorrectCount: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" min="0" placeholder="e.g. 10" />
            </div>

            {/* Not Attempted Count (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Not Attempted (NA)</label>
              <input type="number" value={form.notAttemptedCount} onChange={(e) => setForm({ ...form, notAttemptedCount: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" min="0" placeholder="e.g. 5" />
            </div>
            
            {/* Row 3: Rank, Date, Notes */}
            
            {/* Your Rank (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Your Rank</label>
              <input type="number" value={form.testRank} onChange={(e) => setForm({ ...form, testRank: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" min="1" placeholder="e.g. 15" />
            </div>
            
            {/* Total Takers (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Total Takers</label>
              <input type="number" value={form.totalTestTakers} onChange={(e) => setForm({ ...form, totalTestTakers: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" min="1" placeholder="e.g. 500" />
            </div>

             {/* Date (1/4) */}
            <div>
              <label className="block text-xs font-medium text-gray-700">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" required/>
            </div>
            
             {/* Notes (Full span, but split into two columns for the button) */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700">Notes (Mistakes/Concepts you struggled with)</label>
              <div className="flex gap-2 mt-1">
                  <input 
                      value={form.notes} 
                      onChange={(e) => setForm({ ...form, notes: e.target.value })} 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm" 
                      placeholder="e.g. Forgot formula for time constant in RC circuit." 
                  />
                   {/* NEW: Note Expander Button */}
                  <button 
                      type="button" 
                      onClick={expandNotes}
                      disabled={noteExpandLoading || !form.notes.trim()}
                      className="px-3 py-2 bg-pink-100 text-pink-700 rounded-lg text-xs font-semibold hover:bg-pink-200 transition shadow-sm flex items-center whitespace-nowrap disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                      {noteExpandLoading ? (
                          <Loader size={16} className="animate-spin" />
                      ) : (
                          <><BookOpen size={14} className="mr-1" /> Expand ✨</>
                      )}
                  </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Use "Expand ✨" to turn your short note into a detailed conceptual reminder.</p>
            </div>


            {/* Actions (1/4 span) */}
            <div className="lg:col-span-2 flex items-end gap-3 pt-2 sm:pt-0">
              <button type="submit" 
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-indigo-800 transition duration-300 ease-in-out text-base font-semibold transform hover:scale-[1.01]"
              >
                {form.id ? "Update Test" : "Add Test Entry"}
              </button>
              <button type="button" onClick={resetForm} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition duration-150 shadow-sm">Reset</button>
            </div>
          </div>
        </form>
        
        {/* NEW SECTION: TOP 5 WEAKEST SUBJECTS */}
        {topWeakestSubjects.length > 0 && (
            <section className="bg-white p-6 rounded-2xl shadow-2xl mb-8 border border-red-300">
                <h2 className="text-xl font-semibold text-red-700 mb-4 flex items-center">
                    <AlertTriangle size={20} className="mr-2" /> Top 5 Weakest Subjects (Score Below 65%) {filterProvider !== "All" && `— ${filterProvider}`}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {topWeakestSubjects.map((s, index) => (
                        <div key={s.subject} className="p-4 bg-red-50 rounded-xl border border-red-400 shadow-md transition hover:shadow-lg">
                            <p className="text-sm font-bold text-red-900 mb-1">{s.subject}</p>
                            <p className="text-3xl font-extrabold text-red-600 leading-none">{s.avg}%</p>
                            <p className="text-xs text-red-700 mt-1">{s.count} tests logged</p>
                        </div>
                    ))}
                </div>
                <p className="text-sm text-red-600 mt-4 flex items-center">
                    <Info size={16} className="mr-1.5" />
                    Focus on concepts in these subjects to maximize your GATE score potential.
                </p>
            </section>
        )}


        <section className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Main Content Area: Filter & Table */}
          <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-2xl border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                <ClipboardList size={22} className="mr-2 text-indigo-600" />
                Test Log ({filtered.length} tests) {filterProvider !== "All" && `— ${filterProvider}`}
            </h2>
            <div className="flex flex-wrap justify-between items-center mb-4 gap-3 border-b pb-4">
              <div className="flex flex-wrap gap-2 items-center">
                
                {/* NEW: Provider Filter Dropdown (Set as primary filter) */}
                <select 
                    value={filterProvider} 
                    onChange={(e) => setFilterProvider(e.target.value)} 
                    className="border-2 border-indigo-400 rounded-lg px-3 py-1.5 text-sm shadow-md bg-indigo-50 font-semibold text-indigo-700"
                >
                    <option value="All">Combined Stats (All Providers)</option>
                    {TEST_PROVIDERS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                </select>

                {/* Secondary Filters */}
                <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm shadow-sm">
                  {subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm shadow-sm" title="Filter from date" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm shadow-sm" title="Filter to date" />
                <input placeholder="Search notes/subject/category" value={search} onChange={(e) => setSearch(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-auto shadow-sm" />
              </div>

              <div className="flex gap-2 text-sm">
                <button onClick={handleExportJSON} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-200 shadow-sm transition">JSON</button>
                <label className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-200 cursor-pointer shadow-sm">
                  Import
                  <input type="file" accept="application/json" onChange={(e) => e.target.files && handleImportJSON(e.target.files[0])} className="hidden" />
                </label>
                <button onClick={handleExportCSV} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-200 shadow-sm transition">CSV</button>
                <button onClick={handleClearAll} className="px-3 py-1.5 bg-red-100 border border-red-400 rounded-lg text-red-700 hover:bg-red-200 shadow-sm transition">Clear All</button>
              </div>
            </div>

            {/* Added key={tableKey} here to force component reset */}
            <div className="overflow-x-auto" key={tableKey}>
              <table className="min-w-full table-auto border-collapse">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 rounded-t-xl">
                  <tr>
                    <th className="px-3 py-3 text-left">Subject</th>
                    <th className="px-3 py-3 text-left">Category</th>
                    <th className="px-3 py-3 text-left">Provider</th> {/* NEW: Provider Header */}
                    <th className="px-3 py-3 text-left">Marks (Obt/Max)</th>
                    <th className="px-3 py-3 text-left">%age</th>
                    <th className="px-3 py-3 text-center">R / W / NA</th> 
                    <th className="px-3 py-3 text-left">Rank Stat</th> 
                    <th className="px-3 py-3 text-left">Date</th>
                    <th className="px-3 py-3 text-left">Action</th>
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-gray-200">
                  {/* Conditionally render the 'No tests logged' row OR the actual tests */}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-6 text-gray-500 italic">No tests logged yet. Add your first entry above!</td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <tr key={t.id} className="bg-white hover:bg-indigo-50/50 transition duration-100">
                        <td className="px-3 py-3 text-sm font-medium text-gray-900">{t.subject}</td>
                        <td className="px-3 py-3 text-sm text-gray-600">{t.category}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{t.provider || "Other"}</td> {/* NEW: Provider Data */}
                        <td className="px-3 py-3 text-sm text-gray-700">{t.obtainedMarks}/{t.maxMarks}</td>
                        <td className="px-3 py-3 text-sm font-bold text-indigo-600">{t.percentage}%</td>
                        {/* R/W/NA CELL */}
                        <td className="px-3 py-3 text-sm text-gray-700 text-center">
                          {t.correctCount !== null ? (
                            <>
                              <span className="text-green-600 font-semibold">{t.correctCount}</span> / 
                              <span className="text-red-600 font-semibold"> {t.incorrectCount}</span> / 
                              <span className="text-gray-500 font-semibold"> {t.notAttemptedCount}</span>
                            </>
                          ) : 'N/A'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700">
                            {t.testRank && t.totalTestTakers ? `${t.testRank} / ${t.totalTestTakers}` : 'N/A'}
                            {t.rankPercentile !== null ? <div className="text-xs text-pink-600 font-bold mt-0.5">{t.rankPercentile}%ile</div> : null}
                        </td> 
                        <td className="px-3 py-3 text-sm text-gray-500">{t.date}</td>
                        {/* Removed Notes column to fit Provider, Notes is now in Edit/Title */}
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => handleEdit(t.id)} className="text-xs px-2.5 py-1.5 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition shadow-sm">Edit</button>
                            <button onClick={() => handleDelete(t.id)} className="text-xs px-2.5 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition shadow-sm">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar: Summary & LLM Analysis */}
          <aside className="bg-white p-6 rounded-2xl shadow-2xl border border-gray-200 flex flex-col space-y-6">
            <div className="pb-4 border-b border-gray-300">
              <h3 className="text-xl font-semibold mb-3 text-gray-800 flex items-center">
                  <UserCheck size={20} className="mr-2 text-indigo-600" />
                  Performance Summary
              </h3>
              <p className="text-sm text-gray-500 mb-4">{filterProvider === "All" ? "Combined Stats (All Providers)" : `Analysis for ${filterProvider}`}</p>
              
              <div className="space-y-3">
                  <div className="p-4 bg-indigo-50 rounded-xl flex justify-between items-center border border-indigo-200 shadow-sm">
                      <span className="text-sm font-medium text-indigo-800">Total Tests Logged:</span>
                      <strong className="text-2xl font-extrabold text-indigo-700">{summary.totalTests}</strong>
                  </div>
                  <div className="p-4 bg-indigo-100 rounded-xl flex justify-between items-center border border-indigo-300 shadow-md">
                      <span className="text-base font-semibold text-indigo-800">Overall Average Score:</span>
                      <strong className="text-2xl font-extrabold text-indigo-700">{summary.avg}%</strong>
                  </div>
                  
                  {/* RANK STATS */}
                  {summary.rankedTestsCount > 0 && (
                      <div className="p-4 bg-pink-50 rounded-xl flex justify-between items-center border border-pink-200 shadow-sm">
                          <span className="text-sm font-medium text-pink-800">Avg Rank Percentile:</span>
                          <strong className="text-2xl font-extrabold text-pink-600">{summary.avgRankPercentile}%</strong>
                      </div>
                  )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-base font-semibold mb-2 text-gray-800">Top Scoring Subjects (Avg)</h4>
                <div className="space-y-1 max-h-32 overflow-auto text-sm">
                  {summary.subjectAverages.length === 0 && <div className="text-gray-500">No subjects yet.</div>}
                  {summary.subjectAverages.slice(0, 5).map((s) => (
                    <div key={s.subject} className="flex items-center justify-between p-1.5 bg-white hover:bg-green-50 rounded-md transition border-b border-gray-100">
                      <div className="font-medium text-gray-800">{s.subject} <span className="text-gray-400 text-xs">({s.count})</span></div>
                      <div className="font-bold text-green-700 text-sm">{s.avg}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Gemini LLM Analysis Section */}
            <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-800">AI Mentor Plan</h3>
                <button 
                    onClick={generateStudyPlan} 
                    disabled={llmLoading || summary.totalTests < 2 || API_KEY === ""}
                    className={`w-full flex items-center justify-center px-4 py-2.5 rounded-lg text-white text-base font-semibold transition duration-300 ${llmLoading || summary.totalTests < 2 || API_KEY === "" ? 'bg-gray-400 cursor-not-allowed shadow-inner' : 'bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-700 hover:to-red-700 shadow-lg transform hover:scale-[1.01]'}`}
                >
                    {llmLoading ? (
                        <><Loader size={18} className="animate-spin mr-2" /> Generating Plan...</>
                    ) : (
                        <><Zap size={18} className="mr-2" /> Generate Study Plan</>
                    )}
                </button>
                {API_KEY === "" && (
                     <p className="text-xs text-red-600 mt-2 font-medium bg-red-100 p-2 rounded-md">
                        <AlertTriangle size={14} className="inline mr-1"/>
                        ERROR: AI Mentor cannot connect (API Key missing). Please reload the Preview.
                     </p>
                )}
                {summary.totalTests < 2 && (
                    <p className="text-sm text-gray-500 mt-2 p-1 border-l-2 border-indigo-300">
                        <Info size={14} className="inline mr-1"/>
                        Log at least two tests to activate the mentor.
                    </p>
                )}

                {(llmResult || llmError) && (
                    <div className="mt-4 p-4 text-sm bg-gray-50 rounded-xl border border-gray-300 max-h-96 overflow-y-auto shadow-inner">
                        {llmError ? (
                            <p className="text-red-600 font-medium">Error: {llmError}</p>
                        ) : (
                            <div className="markdown-content" dangerouslySetInnerHTML={{ __html: llmResult.replace(/\n/g, '<br>') }} />
                        )}
                    </div>
                )}
            </div>
          </aside>
        </section>
        
        {/* CHART SECTION */}
        <div className="space-y-8">
            {/* 1. Overall Performance Trend Over Time by Category (All Tests) */}
            <section className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2">Overall Performance Trend Over Time by Category (All Tests) {filterProvider !== "All" && `— ${filterProvider}`}</h3>
            {overallTrendChartData.length === 0 ? (
                <div className="text-sm text-gray-500 h-64 flex items-center justify-center">Add tests to see the overall score trend.</div>
            ) : (
                <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                    <LineChart data={overallTrendChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
                    <YAxis domain={[0, 100]} label={{ value: 'Score %', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6b7280' }} />
                    <Tooltip 
                        content={<OverallPercentageTooltip />} 
                    />
                    <Line type="monotone" dataKey="percentage" stroke="#4F46E5" strokeWidth={2} dot={{ r: 4, fill: '#4F46E5' }} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
                </div>
            )}
            </section>

            {/* 2. Full Test Performance Trend (Mock/Full Length) */}
            <section className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2">Full Test Performance Trend (Mock/Full Length) {filterProvider !== "All" && `— ${filterProvider}`}</h3>
            {fullTestChartData.length === 0 ? (
                <div className="text-sm text-gray-500 h-64 flex items-center justify-center">Log tests in the "Multisubject Wise," "Full Length," or "Mock" categories to see this trend.</div>
            ) : (
                <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                    <LineChart data={fullTestChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
                    <YAxis domain={[0, 100]} label={{ value: 'Score %', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6b7280' }} />
                    <Tooltip 
                        content={<FullTestPercentageTooltip />} 
                    />
                    <Line type="monotone" dataKey="percentage" stroke="#F97316" strokeWidth={2} dot={{ r: 4, fill: '#F97316' }} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
                </div>
            )}
            </section>
            
            {/* 3. Subject Performance Comparison Chart (Vertical Bar Chart) */}
            <section className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2">Subject Performance Comparison (Average Score) {filterProvider !== "All" && `— ${filterProvider}`}</h3>
            {summary.subjectAverages.length === 0 ? (
                <div className="text-sm text-gray-500 h-96 flex items-center justify-center">Add Topic Wise or Subjectwise tests to see comparison.</div>
            ) : (
                <div style={{ width: "100%", height: 400 }}>
                <ResponsiveContainer>
                    <BarChart
                    data={summary.subjectAverages}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                        dataKey="subject" 
                        type="category" 
                        angle={-20}
                        textAnchor="end"
                        height={50} 
                        tick={{ fontSize: 10 }}
                    />
                    <YAxis 
                        type="number" 
                        domain={[0, 100]} 
                        label={{ value: 'Average Score %', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6b7280' }}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                        formatter={(value) => [`${value}%`, 'Average Percentage']}
                        labelFormatter={(label) => `Subject: ${label}`}
                    />
                    <Bar dataKey="avg" fill="#059669" name="Average Percentage" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
                </div>
            )}
            </section>

            {/* 4. Rank Percentile Trend Chart (All Ranked Tests) */}
            <section className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2">Rank Percentile Trend Over Time (All Ranked Tests) {filterProvider !== "All" && `— ${filterProvider}`} (Higher is Better)</h3>
            {rankChartData.length === 0 ? (
                <div className="text-sm text-gray-500 h-64 flex items-center justify-center">Log tests with rank data to see the rank trend.</div>
            ) : (
                <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                    <LineChart data={rankChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
                    <YAxis domain={[0, 100]} label={{ value: 'Rank Percentile %', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6b7280' }} />
                    <Tooltip 
                        content={<RankPercentileTooltip />} 
                    />
                    <Line 
                        type="monotone" 
                        dataKey="rankPercentile" 
                        stroke="#F59E0B" 
                        strokeWidth={2} 
                        dot={{ r: 4, fill: '#F59E0B' }} 
                        activeDot={{ r: 6 }} 
                    />
                    </LineChart>
                </ResponsiveContainer>
                </div>
            )}
            </section>
        </div>


        <footer className="text-center text-xs text-gray-500 mt-8 pb-4">Made with ❤️ and powered by Gemini.</footer>
      </div>
      
      {/* Global UI Components */}
      <ConfirmationModal />
      <ToastAlert message={toastAlert?.message} type={toastAlert?.type} onClose={() => setToastAlert(null)} />
    </div>
  );
}
