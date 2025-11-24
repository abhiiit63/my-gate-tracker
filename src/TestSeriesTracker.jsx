import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  LineChart,
  CalendarCheck,
  User,
  Target,
  Loader2,
  BookOpen,
  ClipboardCheck,
  PlusCircle,
  XCircle,
  TrendingUp,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc, // Added deleteDoc
  doc, // Added doc for deleting
  serverTimestamp,
} from 'firebase/firestore';

// Global Variables provided by the execution environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- MOCK DATA FOR GATE ECE PREPARATION ---
const ECE_SUBJECTS = [
  'Digital Logic',
  'Signals & Systems',
  'Control Systems',
  'Electromagnetics',
  'Analog Circuits',
  'Mathematics',
];

const MOCK_PERFORMANCE_DATA = {
  DigitalLogic: 85,
  SignalsSystems: 72,
  ControlSystems: 58,
  Electromagnetics: 65,
  AnalogCircuits: 88,
  Mathematics: 92,
};

const MOCK_PROGRESS_DATA = {
  DigitalLogic: [
    { week: 1, score: 60 },
    { week: 4, score: 75 },
    { week: 8, score: 85 },
  ],
  ControlSystems: [
    { week: 1, score: 40 },
    { week: 4, score: 55 },
    { week: 8, score: 70 },
  ],
  Mathematics: [
    { week: 1, score: 80 },
    { week: 4, score: 88 },
    { week: 8, score: 92 },
  ],
};

// --- GLOBAL STATE & CONTEXT ---
const AppContext = React.createContext(null);

const AppProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [mockTests, setMockTests] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Initialize Firebase and Authentication
  useEffect(() => {
    if (!firebaseConfig) {
      console.error('Firebase configuration not found.');
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const userAuth = getAuth(app);

      setDb(firestore);
      setAuth(userAuth);

      const unsubscribe = onAuthStateChanged(userAuth, async (user) => {
        if (!user) {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(userAuth, initialAuthToken);
            } else {
              await signInAnonymously(userAuth);
            }
          } catch (error) {
            console.error('Authentication error:', error);
          }
        }
        setUserId(userAuth.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('Firebase setup failed:', e);
      setLoading(false);
    }
  }, []);

  // 2. Fetch Data (Real-time Snapshot)
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;

    const dataPath = `/artifacts/${appId}/users/${userId}/mock_tests`;
    const q = query(collection(db, dataPath));

    setLoading(true);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Ensure metrics are numbers for chart/table operations
        accuracy: Number(doc.data().accuracy),
        marks: Number(doc.data().marks),
        negativeMarks: Number(doc.data().negativeMarks),
        rank: Number(doc.data().rank),
        totalStudents: Number(doc.data().totalStudents),
        timeTaken: Number(doc.data().timeTaken),
        correct: Number(doc.data().correct),
        incorrect: Number(doc.data().incorrect),
        unattempted: Number(doc.data().unattempted),
      }));

      // Sort by date for proper trend charting (no orderBy in Firestore to avoid indexing errors)
      tests.sort((a, b) => new Date(a.date) - new Date(b.date));
      setMockTests(tests);
      setLoading(false);
    }, (error) => {
      console.error('Firestore snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, isAuthReady, userId]);

  // Delete function added to context
  const deleteTestEntry = useCallback(async (testId) => {
      if (!db || !userId) {
          console.error('Database not initialized or user not authenticated.');
          return;
      }
      
      // Implement confirmation modal instead of alert/confirm
      const isConfirmed = window.confirm("Are you sure you want to permanently delete this test entry?");
      if (!isConfirmed) return;

      try {
          const path = `/artifacts/${appId}/users/${userId}/mock_tests`;
          await deleteDoc(doc(db, path, testId));
          
          const modal = document.getElementById('mock-alert-modal');
          const msgElement = document.getElementById('mock-alert-message');
          if (msgElement) msgElement.innerText = 'Test entry deleted successfully.';
          if (modal) modal.classList.remove('hidden', 'bg-red-600');
          if (modal) modal.classList.add('bg-green-600');
          setTimeout(() => {
            if (modal) modal.classList.add('hidden');
          }, 3000);

      } catch (error) {
          console.error('Error deleting document: ', error);
          
          const modal = document.getElementById('mock-alert-modal');
          const msgElement = document.getElementById('mock-alert-message');
          if (msgElement) msgElement.innerText = 'Failed to delete test data.';
          if (modal) modal.classList.remove('hidden', 'bg-green-600');
          if (modal) modal.classList.add('bg-red-600');
          setTimeout(() => {
            if (modal) modal.classList.add('hidden');
          }, 5000);
      }
  }, [db, userId, appId]);


  const value = {
    db,
    auth,
    userId,
    isAuthReady,
    mockTests,
    loading,
    appId,
    deleteTestEntry,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// Hook to use the context
const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// --- UTILITY COMPONENTS ---

const NavItem = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-200 w-full text-left
      ${isActive
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
      }`
    }
  >
    <Icon className="w-5 h-5" />
    <span className="text-sm font-medium hidden md:inline">{label}</span>
  </button>
);

const Card = ({ children, className = '' }) => (
  <div className={`bg-white p-6 rounded-2xl shadow-xl transition-shadow hover:shadow-2xl ${className}`}>
    {children}
  </div>
);

// Helper to format time in HH:MM
const formatTime = (minutes) => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '--';
    const totalMinutes = Math.round(minutes);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const getPercentile = (rank, totalStudents) => {
    if (totalStudents === 0 || rank > totalStudents || rank === 0 || isNaN(rank) || isNaN(totalStudents)) return 0;
    // Percentile = % of students you beat
    return ((totalStudents - rank) / totalStudents) * 100;
};


// --- 1. PERFORMANCE ANALYTICS PAGE ---

const AnalyticsPage = () => {
  const strengths = Object.entries(MOCK_PERFORMANCE_DATA)
    .filter(([, score]) => score >= 80)
    .sort((a, b) => b[1] - a[1]);

  const weaknesses = Object.entries(MOCK_PERFORMANCE_DATA)
    .filter(([, score]) => score < 70)
    .sort((a, b) => a[1] - b[1]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Performance Dashboard</h1>
      <p className="text-gray-500">A detailed breakdown of your subject mastery, based on recent practice tests.</p>

      {/* Summary Score Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 bg-gradient-to-br from-blue-500 to-blue-700 text-white">
          <p className="text-sm opacity-80">Overall Score</p>
          <p className="text-4xl font-extrabold mt-1">77%</p>
          <p className="text-xs mt-2 opacity-70">+5% from last month</p>
        </Card>
        <Card className="col-span-1 bg-gradient-to-br from-teal-500 to-green-600 text-white">
          <p className="text-sm opacity-80">Top Strength</p>
          <p className="text-2xl font-bold mt-1">{strengths[0][0]}</p>
          <p className="text-xs mt-2 opacity-70">Mastery at {strengths[0][1]}%</p>
        </Card>
        <Card className="col-span-1 bg-gradient-to-br from-red-400 to-red-600 text-white">
          <p className="text-sm opacity-80">Focus Area</p>
          <p className="text-2xl font-bold mt-1">{weaknesses[0][0]}</p>
          <p className="text-xs mt-2 opacity-70">Score at {weaknesses[0][1]}%</p>
        </Card>
      </div>

      {/* Detailed Score Bar Chart - Mock */}
      <Card>
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Subject-wise Mastery</h2>
        <div className="space-y-4">
          {Object.entries(MOCK_PERFORMANCE_DATA).map(([subject, score]) => (
            <div key={subject}>
              <div className="flex justify-between text-sm mb-1 font-medium">
                <span>{subject}</span>
                <span className={score < 70 ? 'text-red-500' : 'text-blue-600'}>{score}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ease-out 
                    ${score > 80 ? 'bg-green-500' : score > 70 ? 'bg-blue-500' : 'bg-red-500'}`
                  }
                  style={{ width: `${score}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Strengths and Weaknesses List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-xl font-semibold text-green-600 mb-4 flex items-center">
            <BookOpen className="w-5 h-5 mr-2" />
            Your Strengths (Topics to Maintain)
          </h2>
          <ul className="space-y-3">
            {strengths.map(([subject, score]) => (
              <li key={subject} className="flex justify-between p-3 bg-green-50 rounded-lg">
                <span className="font-medium text-gray-700">{subject}</span>
                <span className="text-green-700 font-bold">{score}%</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold text-red-600 mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Areas for Improvement (High-Priority Focus)
          </h2>
          <ul className="space-y-3">
            {weaknesses.map(([subject, score]) => (
              <li key={subject} className="flex justify-between p-3 bg-red-50 rounded-lg">
                <span className="font-medium text-gray-700">{subject}</span>
                <span className="text-red-700 font-bold">{score}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

// --- 2. VISUAL PROGRESS TRACKER ---

const ProgressTracker = () => {
  const [selectedSubject, setSelectedSubject] = useState(ECE_SUBJECTS[0]);
  const progressHistory = MOCK_PROGRESS_DATA[selectedSubject.replace(/\s/g, '')] || [];

  const ChartPlaceholder = ({ data }) => {
    // Simple bar chart representation
    const maxScore = Math.max(...data.map(d => d.score), 100);

    return (
      <div className="h-64 flex flex-col justify-end p-4 border rounded-xl border-gray-200">
        <div className="flex justify-around items-end h-full w-full">
          {data.length > 0 ? (
            data.map((d, index) => (
              <div key={index} className="flex flex-col items-center h-full justify-end">
                <div
                  className="w-10 rounded-t-lg bg-blue-500 transition-all duration-500 ease-in-out shadow-md hover:bg-blue-600"
                  style={{ height: `${(d.score / maxScore) * 90}%` }}
                ></div>
                <span className="text-xs text-gray-500 mt-1">Wk {d.week}</span>
                <span className="text-xs font-semibold text-blue-600 mt-0.5">{d.score}%</span>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 p-10">
              <LineChart className="w-10 h-10 mx-auto mb-2" />
              No historical data for this subject yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Visual Progress Tracker</h1>
      <p className="text-gray-500">Track your score improvements over time in key subjects.</p>

      <Card>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700">Improvement Trend: {selectedSubject}</h2>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="mt-2 sm:mt-0 p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          >
            {ECE_SUBJECTS.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
        </div>
        <ChartPlaceholder data={progressHistory} />
        <div className="mt-4 flex justify-between text-sm text-gray-500">
          <span>Start Score: {progressHistory[0]?.score || 0}%</span>
          <span>Latest Score: {progressHistory[progressHistory.length - 1]?.score || 0}%</span>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Recommended Next Step</h2>
        <div className="flex items-center space-x-4">
          <Target className="w-8 h-8 text-green-500" />
          <p className="text-gray-600">
            {selectedSubject === 'Control Systems'
              ? 'Focus on Stability Analysis and State-Space Representation to boost your score.'
              : 'Keep practicing a mix of numerical and conceptual problems to consolidate knowledge.'
            }
          </p>
        </div>
      </Card>
    </div>
  );
};

// --- 3. MOCK TEST ANALYSIS PAGE ---

const MockTestAnalysisPage = () => {
  const { mockTests: sortedTests, db, userId, isAuthReady, loading, deleteTestEntry } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('All'); // New filter state
  const [selectedType, setSelectedType] = useState('All'); // New filter state
  
  const platformOptions = ['All', 'Ace Academy', 'PrepFusion', 'GATE Academy', 'MadeEasy', 'Physics Wallah', 'Unacademy', 'Other'];
  const typeOptions = ['All', 'Topic Wise', 'Subject Wise', 'Full Length Mock'];
  
  // Filtering Logic
  const filteredTests = useMemo(() => {
    return sortedTests.filter(test => {
      const platformMatch = selectedPlatform === 'All' || test.platform === selectedPlatform;
      const typeMatch = selectedType === 'All' || test.testType === selectedType;
      return platformMatch && typeMatch;
    });
  }, [sortedTests, selectedPlatform, selectedType]);


  // --- Chart 1: Marks (Bar) vs. Accuracy (Line) ---
  const MarksAccuracyChart = ({ data }) => {
    const history = data;
    
    if (history.length === 0) {
        return <div className="h-64 flex items-center justify-center text-gray-400">Enter mock test data using the button above to see the trend.</div>;
    }

    const marksData = history.map(t => t.marks);
    const accuracyData = history.map(t => t.accuracy);
    const labels = history.map(t => `${t.date.substring(5, 10)} (${t.platform.substring(0, 3)})`);

    // Marks axis (Left Y) scaling
    const maxMarks = Math.max(...marksData, 100);
    const minMarks = Math.min(...marksData, 0);
    const rangeMarks = maxMarks - minMarks;
    const effectiveRangeMarks = rangeMarks === 0 ? 100 : rangeMarks; // Avoid division by zero

    // Chart dimensions (normalized 0-100)
    const width = 100;
    const height = 100;
    const paddingX = 5;
    const barWidth = (width / history.length) - paddingX;
    
    return (
      <div className="h-64 relative p-4 border rounded-xl border-gray-200">
        <div className="absolute top-2 left-2 text-xs font-semibold text-gray-700">Marks vs. Accuracy Trend (Filtered Tests)</div>
        
        {/* Left Y-axis (Marks) */}
        <div className="absolute left-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-blue-600 text-right pr-2">
            <span>{maxMarks.toFixed(0)}</span>
            <span>{minMarks.toFixed(0)}</span>
        </div>
        
        {/* Right Y-axis (Accuracy) */}
        <div className="absolute right-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-green-600 text-left pl-2">
            <span>100%</span>
            <span>0%</span>
        </div>

        {/* Chart Area */}
        <div className="absolute left-10 right-10 top-4 bottom-4">
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            
            {/* Draw Bars (Marks) */}
            {marksData.map((mark, index) => {
              const adjustedX = (index * (barWidth + paddingX)) + (paddingX / 2);
              const barHeight = ((mark - minMarks) / effectiveRangeMarks) * height;
              const y = height - barHeight;
              
              return (
                <rect
                  key={index}
                  x={adjustedX}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="rgba(59, 130, 246, 0.6)" // Blue bars
                >
                    <title>{`${labels[index]} - Marks: ${mark.toFixed(1)}`}</title>
                </rect>
              );
            })}
            
            {/* Draw Line (Accuracy) */}
            <g>
                {accuracyData.map((acc, index, array) => {
                    // X calculation uses the center of the bar for alignment
                    const x = (index * (barWidth + paddingX)) + barWidth / 2 + (paddingX / 2);
                    const y = height - (acc / 100) * height;
                    
                    const point = { x, y, acc, index };

                    return (
                        <g key={point.index}>
                            {/* Line Segments */}
                            {index > 0 && (
                                <line
                                    x1={((index - 1) * (barWidth + paddingX)) + barWidth / 2 + (paddingX / 2)}
                                    y1={height - (array[index - 1] / 100) * height}
                                    x2={point.x}
                                    y2={point.y}
                                    stroke="rgb(22, 163, 74)" // Green line
                                    strokeWidth="2"
                                />
                            )}
                            {/* Points */}
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r="2"
                                fill="rgb(22, 163, 74)"
                            >
                                <title>{`${labels[point.index]} - Accuracy: ${point.acc.toFixed(1)}%`}</title>
                            </circle>
                        </g>
                    );
                })}
            </g>
          </svg>
        </div>
        
        {/* X-axis Labels */}
        <div className="absolute bottom-0 left-10 right-10 flex justify-between text-xs text-gray-500 pt-2 border-t">
            {labels.map((label, i) => (
                <span key={i} className="text-center w-12 truncate">{label}</span>
            ))}
        </div>
      </div>
    );
  };
  
  // --- Chart 2: Rank Comparison Chart (All Tests) ---
  const RankComparisonChart = ({ data }) => {
    const history = data;

    // Filter tests that actually have a rank and totalStudents
    const rankedTests = history.filter(t => t.rank > 0 && t.totalStudents > 0);
    
    if (rankedTests.length < 2) {
        return <div className="h-64 flex items-center justify-center text-gray-400">Need at least two mock tests to track rank trends.</div>;
    }
    
    // Get unique platforms and assign colors
    const platforms = [...new Set(rankedTests.map(t => t.platform))].sort();
    const platformColors = {
      'Ace Academy': '#3b82f6', // blue-500
      'PrepFusion': '#10b981', // emerald-500
      'GATE Academy': '#ef4444', // red-500
      'MadeEasy': '#a855f7', // violet-500
      'Other': '#6b7280', // gray-500
    };
    
    // Find highest (worst) rank and ensure a base scaling
    const ranks = rankedTests.map(t => t.rank);
    const maxRank = Math.max(...ranks, 100); 

    // Chart dimensions (normalized 0-100)
    const width = 100;
    const height = 100;
    
    // Calculate point X positions
    const points = rankedTests.map((t, index) => {
        const x = (index / (rankedTests.length > 1 ? rankedTests.length - 1 : 1)) * width;
        // Inverted Y axis: (Max Rank - Current Rank) / Max Rank. Max Rank maps to bottom (0), Rank 1 maps to top (100)
        const normalizedRank = maxRank === 0 ? 0 : (maxRank - t.rank) / maxRank; 
        const y = height - (normalizedRank * height);
        
        return { x, y, rank: t.rank, platform: t.platform, date: t.date };
    });
    
    // Group points by platform for drawing separate lines
    const platformPoints = platforms.map(p => ({
        platform: p,
        color: platformColors[p] || platformColors['Other'],
        // Filter points belonging to this platform and ensure they match the order of rankedTests
        data: points.filter(point => point.platform === p)
    }));

    return (
      <Card className="h-96">
        <div className="h-full relative p-4">
            <div className="absolute top-2 left-2 text-xs font-semibold text-gray-700">Rank Comparison Trend (Filtered Tests)</div>
            
            {/* Y-axis (Rank, Inverted) */}
            <div className="absolute left-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-gray-600 text-right pr-2">
                <span className="font-bold text-green-600">Rank 1</span>
                <span className="font-bold text-red-600">Rank {maxRank}</span>
            </div>
            
            {/* Chart Area */}
            <div className="absolute left-10 right-0 top-4 bottom-4">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {platformPoints.map(platformGroup => (
                    <g key={platformGroup.platform}>
                        {/* Draw Line Segments */}
                        {platformGroup.data.map((point, index, array) => (
                            index > 0 && (
                                <line
                                    key={`line-${index}`}
                                    x1={array[index - 1].x}
                                    y1={array[index - 1].y}
                                    x2={point.x}
                                    y2={point.y}
                                    stroke={platformGroup.color}
                                    strokeWidth="2"
                                />
                            )
                        ))}
                        {/* Draw Points */}
                        {platformGroup.data.map((point, index) => (
                            <circle
                                key={`point-${index}`}
                                cx={point.x}
                                cy={point.y}
                                r="2.5"
                                fill={platformGroup.color}
                            >
                                <title>{`${point.platform} - ${point.date.substring(5, 10)}: Rank ${point.rank}`}</title>
                            </circle>
                        ))}
                    </g>
                ))}
              </svg>
            </div>
            
            {/* X-axis Labels */}
            <div className="absolute bottom-0 left-10 right-0 flex justify-between text-xs text-gray-500 pt-2 border-t">
                {rankedTests.map((t, i) => (
                    <span key={i} className="text-center w-12 truncate">{t.date.substring(5, 10)}</span>
                ))}
            </div>

            {/* Legend */}
            <div className="absolute top-0 right-0 p-2 text-xs">
                 {platforms.map(p => (
                    <div key={p} className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: platformColors[p] || platformColors['Other'] }}></div>
                        <span>{p}</span>
                    </div>
                ))}
            </div>
        </div>
      </Card>
    );
  };
  
  // --- Chart 3: Performance by Test Category ---
  const CategoryTrendChart = ({ data }) => {
    const history = data;

    if (history.length < 2) {
        return <div className="h-64 flex items-center justify-center text-gray-400">Need more data points to analyze category trends.</div>;
    }

    const testTypes = [...new Set(history.map(t => t.testType))].sort();
    const typeColors = {
      'Full Length Mock': '#3b82f6', // Blue
      'Subject Wise': '#10b981',   // Green
      'Topic Wise': '#f59e0b',     // Amber
      'Other': '#6b7280',          // Gray
    };

    const marksData = history.map(t => t.marks);
    const maxMarks = Math.max(...marksData, 100);
    const minMarks = Math.min(...marksData, 0);
    const rangeMarks = maxMarks - minMarks;
    const effectiveRangeMarks = rangeMarks === 0 ? 100 : rangeMarks;

    const width = 100;
    const height = 100;
    
    // Group points by test type for drawing separate lines
    const typePoints = testTypes.map(type => ({
        type: type,
        color: typeColors[type] || typeColors['Other'],
        data: history.filter(t => t.testType === type)
    }));
    
    // Calculate point X positions relative to the overall test count
    const totalTests = history.length;
    
    const calculateX = (index) => (index / (totalTests > 1 ? totalTests - 1 : 1)) * width;

    return (
      <Card className="lg:col-span-2 h-96">
        <div className="h-full relative p-4">
            <div className="absolute top-2 left-2 text-xs font-semibold text-gray-700">Marks Trend by Test Category (Filtered Tests)</div>
            
            {/* Y-axis (Marks) */}
            <div className="absolute left-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-blue-600 text-right pr-2">
                <span>{maxMarks.toFixed(0)}</span>
                <span>{minMarks.toFixed(0)}</span>
            </div>
            
            {/* Chart Area */}
            <div className="absolute left-10 right-0 top-4 bottom-4">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {typePoints.map(typeGroup => (
                    <g key={typeGroup.type}>
                        {typeGroup.data.map((test, index, array) => {
                            const overallIndex = history.findIndex(t => t.id === test.id);
                            const x = overallIndex > 0 ? calculateX(overallIndex) : 0; // x based on overall index
                            const y = height - ((test.marks - minMarks) / effectiveRangeMarks) * height;
                            
                            // Line Segments connecting points within the same category
                            if (index > 0) {
                                const prevTest = array[index - 1];
                                const prevOverallIndex = history.findIndex(t => t.id === prevTest.id);
                                const x1 = prevOverallIndex > 0 ? calculateX(prevOverallIndex) : 0;
                                const y1 = height - ((prevTest.marks - minMarks) / effectiveRangeMarks) * height;

                                return (
                                    <g key={`group-${index}`}>
                                        <line
                                            x1={x1}
                                            y1={y1}
                                            x2={x}
                                            y2={y}
                                            stroke={typeGroup.color}
                                            strokeWidth="2"
                                        />
                                        <circle cx={x} cy={y} r="2.5" fill={typeGroup.color}><title>{`${test.testName} (${test.testType}): ${test.marks.toFixed(1)}`}</title></circle>
                                    </g>
                                );
                            }
                            // Draw point for the first item in the category group
                            return <circle key={`point-${index}`} cx={x} cy={y} r="2.5" fill={typeGroup.color}><title>{`${test.testName} (${test.testType}): ${test.marks.toFixed(1)}`}</title></circle>;
                        })}
                    </g>
                ))}
              </svg>
            </div>
            
            {/* X-axis Labels */}
            <div className="absolute bottom-0 left-10 right-0 flex justify-between text-xs text-gray-500 pt-2 border-t">
                {history.map((t, i) => (
                    <span key={i} className="text-center w-12 truncate">{t.date.substring(5, 10)}</span>
                ))}
            </div>

            {/* Legend */}
            <div className="absolute top-0 right-0 p-2 text-xs">
                 {testTypes.map(type => (
                    <div key={type} className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColors[type] || typeColors['Other'] }}></div>
                        <span>{type}</span>
                    </div>
                ))}
            </div>
        </div>
      </Card>
    );
  };
  
  // --- Chart 4: Full Test Performance Trend (Mock/Full Length) ---
  const FullMockTrendChart = ({ data }) => {
    const fullMocks = data.filter(t => t.testType === 'Full Length Mock');

    if (fullMocks.length < 2) {
        return <div className="h-64 flex items-center justify-center text-gray-400">Need at least two Full Length Mock tests for this combined trend analysis.</div>;
    }

    const marksData = fullMocks.map(t => t.marks);
    const accuracyData = fullMocks.map(t => t.accuracy);
    const ranks = fullMocks.map(t => t.rank);
    const labels = fullMocks.map(t => `${t.date.substring(5, 10)}`);

    // Marks axis (Left Y) scaling
    const maxMarks = Math.max(...marksData, 100);
    const minMarks = Math.min(...marksData, 0);
    const rangeMarks = maxMarks - minMarks;
    const effectiveRangeMarks = rangeMarks === 0 ? 100 : rangeMarks; 
    
    // Rank axis (Right Y) scaling (Inverted)
    const maxRank = Math.max(...ranks, 100);

    // Chart dimensions (normalized 0-100)
    const width = 100;
    const height = 100;
    
    const calculateX = (index) => (index / (fullMocks.length > 1 ? fullMocks.length - 1 : 1)) * width;

    const dataPoints = fullMocks.map((t, index) => {
        const x = calculateX(index);
        
        // Y for Marks (Left Axis)
        const yMarks = height - ((t.marks - minMarks) / effectiveRangeMarks) * height;
        
        // Y for Rank (Right Axis - Inverted)
        const normalizedRank = maxRank === 0 ? 0 : (maxRank - t.rank) / maxRank; 
        const yRank = height - (normalizedRank * height);
        
        // Y for Accuracy (Right Axis)
        const yAccuracy = height - (t.accuracy / 100) * height;

        return { x, yMarks, yRank, yAccuracy, rank: t.rank, marks: t.marks, accuracy: t.accuracy, index, platform: t.platform };
    });

    return (
      <Card className="lg:col-span-2 h-96">
        <div className="h-full relative p-4">
            <div className="absolute top-2 left-2 text-xs font-semibold text-gray-700">Full Mock Trend (Marks, Accuracy, Rank) (Filtered Tests)</div>
            
            {/* Left Y-axis (Marks) */}
            <div className="absolute left-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-blue-600 text-right pr-2">
                <span>{maxMarks.toFixed(0)} Marks</span>
                <span>{minMarks.toFixed(0)} Marks</span>
            </div>
            
            {/* Right Y-axis (Accuracy & Rank) */}
            <div className="absolute right-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-gray-600 text-left pl-2">
                <span className="font-bold text-green-600">Rank 1 / 100%</span>
                <span className="font-bold text-red-600">Rank {maxRank} / 0%</span>
            </div>

            {/* Chart Area */}
            <div className="absolute left-10 right-10 top-4 bottom-4">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                
                {/* 1. Marks Trend (Blue Line) */}
                <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    points={dataPoints.map(p => `${p.x},${p.yMarks}`).join(' ')}
                />
                
                {/* 2. Accuracy Trend (Green Line) */}
                <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    points={dataPoints.map(p => `${p.x},${p.yAccuracy}`).join(' ')}
                />
                
                {/* 3. Rank Trend (Purple Line) */}
                <polyline
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2"
                    points={dataPoints.map(p => `${p.x},${p.yRank}`).join(' ')}
                />
                
                {/* Draw Points and Tooltips */}
                {dataPoints.map(p => (
                    <g key={p.index}>
                        {/* Marks Point */}
                        <circle cx={p.x} cy={p.yMarks} r="2.5" fill="#3b82f6"><title>{`Marks: ${p.marks.toFixed(1)}`}</title></circle>
                        {/* Accuracy Point */}
                        <circle cx={p.x} cy={p.yAccuracy} r="2.5" fill="#10b981"><title>{`Accuracy: ${p.accuracy.toFixed(1)}%`}</title></circle>
                        {/* Rank Point */}
                        <circle cx={p.x} cy={p.yRank} r="2.5" fill="#a855f7"><title>{`Rank: ${p.rank} (${p.platform})`}</title></circle>
                    </g>
                ))}
              </svg>
            </div>
            
            {/* X-axis Labels */}
            <div className="absolute bottom-0 left-10 right-10 flex justify-between text-xs text-gray-500 pt-2 border-t">
                {labels.map((label, i) => (
                    <span key={i} className="text-center w-12 truncate">{label}</span>
                ))}
            </div>

            {/* Legend */}
            <div className="absolute top-0 right-0 p-2 text-xs">
                <div className="flex items-center space-x-1 text-blue-600"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span>Marks (Left Axis)</span></div>
                <div className="flex items-center space-x-1 text-green-600"><div className="w-2 h-2 border border-dashed border-green-600"></div><span>Accuracy % (Right Axis)</span></div>
                <div className="flex items-center space-x-1 text-purple-600"><div className="w-2 h-2 bg-purple-600 rounded-full"></div><span>Rank (Right Axis, Inverted)</span></div>
            </div>
        </div>
      </Card>
    );
  };
  
  // --- Test Entry Form (Enhanced) ---
  const TestEntryForm = () => {
    const { db, userId, appId } = useAppContext();
    const [formData, setFormData] = useState({
      provider: 'Ace Academy',
      testType: 'Full Length Mock',
      testName: '',
      date: new Date().toISOString().substring(0, 10),
      totalQuestions: 65,
      totalMarks: 100,
      timeTaken: '',
      marksObtained: '',
      negativeMarks: '',
      rank: '',
      totalStudents: '',
      correct: '',
      wrong: '',
    });
    
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const stats = useMemo(() => {
        const correct = parseFloat(formData.correct) || 0;
        const wrong = parseFloat(formData.wrong) || 0;
        const totalQuestions = parseFloat(formData.totalQuestions) || 65;
        
        const attemptedQuestions = correct + wrong;
        
        const acc = attemptedQuestions > 0 ? ((correct / attemptedQuestions) * 100) : 0;
        
        const unattempted = totalQuestions - attemptedQuestions;

        return {
            accuracy: acc.toFixed(1),
            unattempted: unattempted >= 0 ? unattempted : 0, // Ensure numeric 0 fallback
        };
    }, [formData.correct, formData.wrong, formData.totalQuestions]);
    
    const handleChange = (e) => {
      const { name, value, type } = e.target;
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' || name === 'timeTaken' || name === 'marksObtained' || name === 'negativeMarks' || name === 'rank' || name === 'totalStudents' || name === 'correct' || name === 'wrong' ? (value === '' ? '' : parseFloat(value)) : value,
      }));
      if (name === 'testType') {
        if (value === 'Full Length Mock') {
            setFormData(prev => ({...prev, totalQuestions: 65, totalMarks: 100}));
        } else if (value === 'Subject Wise') {
            setFormData(prev => ({...prev, totalQuestions: 40, totalMarks: 50}));
        } else {
            setFormData(prev => ({...prev, totalQuestions: 30, totalMarks: 30}));
        }
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      
      const { marksObtained, totalMarks, negativeMarks, rank, totalStudents, correct, wrong, totalQuestions } = formData;
      
      const attemptedQuestions = parseFloat(formData.correct || 0) + parseFloat(formData.wrong || 0);

      if (!db) {
          setError('Database connection not ready.');
          return;
      }

      if (!formData.provider || !formData.date || marksObtained === '' || rank === '' || totalStudents === '' || correct === '' || wrong === '' || negativeMarks === '') {
        setError('Please fill in all essential fields: Provider, Date, Marks, Rank, Total Takers, Correct, Wrong, and Negative Marks.');
        return;
      }
      
      if (attemptedQuestions > totalQuestions) {
          setError('Data mismatch: Total Attempted questions exceed Total Questions.');
          return;
      }
      
      if (marksObtained > totalMarks) {
          setError('Data mismatch: Obtained Marks cannot exceed Total Marks.');
          return;
      }
      
      // Ensure all numeric fields are stored as numbers (even if the form returns them as strings/floats)
      const numericFormData = {
          timeTaken: parseFloat(formData.timeTaken) || 0,
          marks: parseFloat(marksObtained),
          negativeMarks: parseFloat(negativeMarks),
          rank: parseFloat(rank),
          totalStudents: parseFloat(totalStudents),
          correct: parseFloat(correct),
          incorrect: parseFloat(wrong),
      };


      const newTest = {
        platform: formData.provider,
        testType: formData.testType,
        testName: formData.testName || `${formData.testType} Test`,
        date: formData.date,
        totalQuestions: totalQuestions,
        totalMarks: totalMarks,
        unattempted: parseFloat(stats.unattempted) || 0,
        accuracy: parseFloat(stats.accuracy),
        ...numericFormData, // Spread numeric data
        createdAt: serverTimestamp(),
      };
      
      setIsSaving(true);
      try {
        const path = `/artifacts/${appId}/users/${userId}/mock_tests`;
        await addDoc(collection(db, path), newTest);
        
        setShowForm(false);
        // Reset form for next entry
        setFormData(prev => ({
            ...prev,
            testName: '',
            marksObtained: '',
            negativeMarks: '',
            rank: '',
            totalStudents: '',
            correct: '',
            wrong: '',
            timeTaken: '',
            date: new Date().toISOString().substring(0, 10),
        }));

        const modal = document.getElementById('mock-alert-modal');
        const msgElement = document.getElementById('mock-alert-message');
        if (msgElement) msgElement.innerText = 'Test Saved! Check your analysis table.';
        if (modal) modal.classList.remove('hidden', 'bg-red-600');
        if (modal) modal.classList.add('bg-green-600');
        setTimeout(() => {
          if (modal) modal.classList.add('hidden');
        }, 3000);

      } catch (err) {
          console.error('Error saving document: ', err);
          setError('Failed to save test data to the cloud. Please try again.');
          
          const modal = document.getElementById('mock-alert-modal');
          const msgElement = document.getElementById('mock-alert-message');
          if (msgElement) msgElement.innerText = 'Error saving test data!';
          if (modal) modal.classList.remove('hidden', 'bg-green-600');
          if (modal) modal.classList.add('bg-red-600');
          setTimeout(() => {
            if (modal) modal.classList.add('hidden');
          }, 5000);

      } finally {
        setIsSaving(false);
      }
    };

    const inputClass = "mt-1 block w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500";
    const selectClass = "mt-1 block w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500";
    const labelClass = "block text-sm font-medium text-gray-700";
    const statItemClass = "flex items-center justify-between bg-slate-100 p-4 rounded-xl border border-slate-200";


    return (
      <div className="flex justify-center w-full">
        <Card className="w-full max-w-4xl shadow-lg">
          <header className="bg-blue-600 text-white rounded-t-2xl p-6 flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
                <PlusCircle className="w-6 h-6 mr-2" />
                GATE 2026 • Test Entry
            </h2>
             <button onClick={() => setShowForm(false)} className="text-white hover:text-red-300 transition">
                <XCircle className="w-6 h-6" />
            </button>
          </header>

          <div className="p-6">
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm flex items-center" role="alert"><AlertTriangle className='w-4 h-4 mr-2'/>{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Section 1: Meta Data & Test Setup */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Provider</label>
                    <select name="provider" value={formData.provider} onChange={handleChange} className={selectClass}>
                        {platformOptions.slice(1).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Test Type</label>
                    <select name="testType" value={formData.testType} onChange={handleChange} className={selectClass}>
                        {typeOptions.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className={labelClass}>Test Name/Topic</label>
                    <input type="text" name="testName" value={formData.testName} onChange={handleChange} className={inputClass} placeholder="e.g. Control Systems - Nyquist Plot" required/>
                  </div>
              </div>
              
              {/* Row 2: Basic Test Parameters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4">
                  <div>
                      <label className={labelClass}>Date</label>
                      <input type="date" name="date" value={formData.date} onChange={handleChange} className={inputClass} required />
                  </div>
                  <div>
                      <label className={labelClass}>Total Questions</label>
                      <input type="number" name="totalQuestions" value={formData.totalQuestions} onChange={handleChange} className={inputClass} readOnly={formData.testType !== 'Topic Wise'} />
                  </div>
                  <div>
                      <label className={labelClass}>Total Marks</label>
                      <input type="number" step="1" name="totalMarks" value={formData.totalMarks} onChange={handleChange} className={inputClass} readOnly={formData.testType !== 'Topic Wise'} />
                  </div>
                  <div>
                    <label className={labelClass}>Time Taken (Mins)</label>
                    <div className="relative">
                        <input type="number" name="timeTaken" value={formData.timeTaken} onChange={handleChange} className={inputClass} placeholder="180" />
                        <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>
              </div>
              
              {/* Section 3: Question Breakdown & Results */}
              <h3 className="text-lg font-semibold text-gray-700 mt-6">Attempt Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Correct */}
                  <div>
                    <label className="block text-xs font-bold text-green-600 uppercase mb-1">Correct</label>
                    <input type="number" name="correct" value={formData.correct} onChange={handleChange} className="w-full rounded-md border-green-300 bg-green-50 p-3 text-center font-bold text-green-800 text-lg" required />
                  </div>
                  {/* Wrong */}
                  <div>
                    <label className="block text-xs font-bold text-red-600 uppercase mb-1">Wrong</label>
                    <input type="number" name="wrong" value={formData.wrong} onChange={handleChange} className="w-full rounded-md border-red-300 bg-red-50 p-3 text-center font-bold text-red-800 text-lg" required />
                  </div>
                  {/* Attempted (Calculated from Correct + Wrong) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Total Attempted</label>
                    <input type="number" name="attempted" value={parseFloat(formData.correct || 0) + parseFloat(formData.wrong || 0)} onChange={handleChange} className="w-full rounded-md border-gray-300 bg-gray-100 p-3 text-center font-mono text-gray-700 text-lg" readOnly />
                  </div>
                   {/* Unattempted (Calculated) */}
                  <div>
                    <label className="block text-xs font-bold text-yellow-600 uppercase mb-1">Unattempted</label>
                    <input type="text" value={stats.unattempted} className="w-full rounded-md border-yellow-300 bg-yellow-50 p-3 text-center font-mono text-yellow-800 text-lg" readOnly />
                  </div>
              </div>

              {/* Section 4: Scores & Ranks */}
              <h3 className="text-lg font-semibold text-gray-700 mt-6">Scores & Ranks</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Marks Obtained */}
                  <div>
                    <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Marks Obtained</label>
                    <input type="number" step="0.01" name="marksObtained" value={formData.marksObtained} onChange={handleChange} placeholder="0.00" className="w-full rounded-md border-blue-300 bg-blue-50 p-3 text-center font-bold text-blue-800 text-lg" required />
                  </div>
                  {/* Negative Marks */}
                  <div>
                    <label className="block text-xs font-bold text-purple-600 uppercase mb-1">Negative Marks</label>
                    <input type="number" step="0.01" name="negativeMarks" value={formData.negativeMarks} onChange={handleChange} placeholder="0.00" className="w-full rounded-md border-purple-300 bg-purple-50 p-3 text-center font-bold text-purple-800 text-lg" required />
                  </div>
                  {/* Rank */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Your Rank</label>
                    <input type="number" name="rank" value={formData.rank} onChange={handleChange} className="w-full rounded-md border-gray-300 p-3 text-center font-mono text-lg" required />
                  </div>
                  {/* Total Takers */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Total Takers</label>
                    <input type="number" name="totalStudents" value={formData.totalStudents} onChange={handleChange} className="w-full rounded-md border-gray-300 p-3 text-center font-mono text-lg" required />
                  </div>
              </div>
              
              {/* Live Analytics Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={statItemClass}>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <div className="text-sm font-medium text-gray-600">
                    Accuracy
                  </div>
                  <span className={`text-xl font-bold ${parseFloat(stats.accuracy) > 85 ? 'text-green-600' : 'text-orange-500'}`}>
                    {stats.accuracy}%
                  </span>
                </div>
                <div className={statItemClass}>
                  <Clock className="w-5 h-5 text-gray-600" />
                  <div className="text-sm font-medium text-gray-600">
                    Questions Per Minute
                  </div>
                  <span className="text-xl font-bold text-gray-700">
                    {((parseFloat(formData.correct || 0) + parseFloat(formData.wrong || 0)) / (parseFloat(formData.timeTaken) || 1)).toFixed(2)}
                  </span>
                </div>
              </div>
              
              <button
                type="submit"
                className="w-full rounded-md bg-green-600 py-3 text-white font-bold hover:bg-green-700 transition-colors shadow-lg flex items-center justify-center space-x-2"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                <span>{isSaving ? 'SAVING...' : 'SAVE TEST STATS'}</span>
              </button>
            </form>
          </div>
        </Card>
      </div>
    );
  };


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Mock Test Analysis</h1>
      <p className="text-gray-500">Compare your performance across different testing platforms and test categories to identify trends.</p>

      {/* Database Status */}
      {loading && (
        <div className="flex items-center space-x-2 text-blue-600 font-semibold p-3 bg-blue-50 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading mock test data from the cloud...</span>
        </div>
      )}
      {!isAuthReady && (
        <div className="flex items-center space-x-2 text-red-600 font-semibold p-3 bg-red-50 rounded-lg">
          <AlertTriangle className="w-5 h-5" />
          <span>Authentication initializing. Please wait.</span>
        </div>
      )}


      {/* Test Entry Form Toggle */}
      <button
          onClick={() => setShowForm(!showForm)}
          className={`w-full p-3 rounded-lg font-semibold transition duration-200 shadow-md flex items-center justify-center space-x-2
            ${showForm ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
          disabled={loading || !isAuthReady}
      >
        {showForm ? <XCircle className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
        <span>{showForm ? 'Close Entry Form' : 'Add New Mock Test Data'}</span>
      </button>

      {/* Input Form */}
      {showForm && <TestEntryForm />}


      {/* Filtering Controls */}
      <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
        <div className="flex-1">
          <label htmlFor="platform-filter" className="block text-sm font-medium text-gray-700">Filter by Platform</label>
          <select
            id="platform-filter"
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700">Filter by Test Type</label>
          <select
            id="type-filter"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>


      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-96">
            <MarksAccuracyChart data={filteredTests} />
          </Card>
          
          <RankComparisonChart data={filteredTests} />
          
          <FullMockTrendChart data={filteredTests} />
          
          <CategoryTrendChart data={filteredTests} />
      </div>


      {/* Detailed Mock Test Table */}
      <Card className="lg:col-span-2">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Detailed Test History ({filteredTests.length} entries shown)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Name</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Marks (Total)</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Time (H:M)</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Neg. Marks</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rank (Takers)</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Percentile</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Accuracy</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">C/I/U</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTests.slice().reverse().map(test => (
                <tr key={test.id} className="hover:bg-blue-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <p className="font-semibold">{test.date}</p>
                    <p className="text-xs text-gray-500">{test.testName}</p>
                    <span className={`px-2 py-0.5 mt-1 text-xs rounded-full font-semibold inline-block ${test.platform === 'Ace Academy' ? 'bg-blue-100 text-blue-800' : test.platform === 'PrepFusion' ? 'bg-green-100 text-green-800' : test.platform === 'GATE Academy' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-800'}`}>
                      {test.platform}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-700">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-semibold inline-block ${test.testType === 'Full Length Mock' ? 'bg-purple-100 text-purple-800' : test.testType === 'Subject Wise' ? 'bg-yellow-100 text-yellow-800' : 'bg-pink-100 text-pink-800'}`}>
                      {test.testType.substring(0, 7)}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-semibold text-blue-600">{test.marks.toFixed(1)} <span className="text-gray-400">({test.totalMarks})</span></td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-700">{formatTime(test.timeTaken)}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-red-500">-{test.negativeMarks.toFixed(1)}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-semibold">{test.rank} <span className="text-gray-400">({test.totalStudents})</span></td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-green-600 font-semibold">{getPercentile(test.rank, test.totalStudents).toFixed(1)}%</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-medium">{test.accuracy.toFixed(1)}%</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-right">
                    <span className="text-green-600">{test.correct}</span> /
                    <span className="text-red-500"> {test.incorrect}</span> /
                    <span className="text-gray-500">{test.unattempted}</span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                          onClick={() => deleteTestEntry(test.id)}
                          className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100 transition"
                          title="Delete Test Entry"
                      >
                          <Trash2 className="w-4 h-4" />
                      </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTests.length === 0 && (
            <div className="text-center p-8 text-gray-500">
                <ClipboardCheck className='w-8 h-8 mx-auto mb-2 text-gray-400' />
                {sortedTests.length === 0 ? (
                    'No mock test data found. Use the "Add New Mock Test Data" button to get started!'
                ) : (
                    'No tests match the current filter criteria.'
                )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

// --- 4. STUDY PLAN ---

const StudyPlan = () => {
  // Uses local state as this is simple goal tracking, though could be extended to Firestore later
  const [goals, setGoals] = useState(() => [
    { id: 1, text: 'Complete Digital Logic syllabus by Week 10.', subject: 'Digital Logic', completed: true },
    { id: 2, text: 'Score 80% on Signals & Systems mock test.', subject: 'Signals & Systems', completed: false },
    { id: 3, text: 'Practice 50 numericals in Mathematics (Calculus).', subject: 'Mathematics', completed: false },
  ]);
  const [newGoal, setNewGoal] = useState('');
  const [newSubject, setNewSubject] = useState(ECE_SUBJECTS[0]);

  const addGoal = () => {
    if (newGoal.trim() !== '') {
      setGoals([...goals, { id: Date.now(), text: newGoal.trim(), subject: newSubject, completed: false }]);
      setNewGoal('');
    }
  };

  const toggleGoal = (id) => {
    setGoals(goals.map(goal =>
      goal.id === id ? { ...goal, completed: !goal.completed } : goal
    ));
  };

  const pendingGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Your Study Planner</h1>
      <p className="text-gray-500">Set clear, actionable goals to stay on track for GATE 2026.</p>

      <Card>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Set a New Goal</h2>
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:space-x-3">
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="e.g., Finish 'Control Systems' first half by Friday"
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          >
            {ECE_SUBJECTS.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          <button
            onClick={addGoal}
            className="bg-green-500 text-white p-3 rounded-lg font-medium hover:bg-green-600 transition duration-200 shadow-md"
          >
            Add Goal
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-xl font-semibold text-blue-600 mb-4">Pending Goals ({pendingGoals.length})</h2>
          <ul className="space-y-3">
            {pendingGoals.map(goal => (
              <li key={goal.id} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <input
                  type="checkbox"
                  checked={goal.completed}
                  onChange={() => toggleGoal(goal.id)}
                  className="mt-1 w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <p className="text-gray-800 leading-snug">{goal.text}</p>
                  <span className="text-xs text-blue-500 font-medium bg-blue-100 px-2 py-0.5 rounded-full mt-1 inline-block">{goal.subject}</span>
                </div>
              </li>
            ))}
            {pendingGoals.length === 0 && <p className="text-gray-400 italic">All clear! Time to set new targets.</p>}
          </ul>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-green-600 mb-4">Completed Goals ({completedGoals.length})</h2>
          <ul className="space-y-3">
            {completedGoals.map(goal => (
              <li key={goal.id} className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg opacity-80 line-through">
                <input
                  type="checkbox"
                  checked={goal.completed}
                  onChange={() => toggleGoal(goal.id)}
                  className="mt-1 w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                />
                <div>
                  <p className="text-gray-500 leading-snug">{goal.text}</p>
                  <span className="text-xs text-green-500 font-medium bg-green-100 px-2 py-0.5 rounded-full mt-1 inline-block">{goal.subject}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

// --- 5. PROFILE & SETTINGS PAGE ---

const ProfileSettings = () => {
  const [profile, setProfile] = useState({
    name: 'Graduate Engineer',
    email: 'gate_aspirant_2026@mail.com',
    targetExam: 'GATE 2026 (ECE)',
    weeklyHours: 30,
    notification: true,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSave = () => {
    // Mock save operation
    console.log('Saving settings:', profile);
    // Mock alert/modal function
    const modal = document.getElementById('mock-alert-modal');
    const msgElement = document.getElementById('mock-alert-message');
    if (msgElement) msgElement.innerText = 'Settings saved successfully!';
    // Using green for success
    if (modal) modal.classList.remove('hidden', 'bg-red-600');
    if (modal) modal.classList.add('bg-green-600');
    setTimeout(() => {
      if (modal) modal.classList.add('hidden');
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Profile & Settings</h1>
      <p className="text-gray-500">Manage your personal information and application preferences.</p>

      {/* Profile Card */}
      <Card>
        <div className="flex items-center space-x-4 mb-6 border-b pb-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold">
            GE
          </div>
          <div>
            <p className="text-xl font-semibold">{profile.name}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-gray-700 mb-4">Account Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Exam</label>
            <input
              type="text"
              name="targetExam"
              value={profile.targetExam}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weekly Study Hours Goal</label>
            <input
              type="number"
              name="weeklyHours"
              value={profile.weeklyHours}
              onChange={handleChange}
              min="1"
              max="100"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </Card>

      {/* Settings Card */}
      <Card>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Application Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <label htmlFor="notification-toggle" className="text-sm font-medium text-gray-700">
              Email Notifications
            </label>
            <input
              type="checkbox"
              id="notification-toggle"
              name="notification"
              checked={profile.notification}
              onChange={handleChange}
              className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      <button
        onClick={handleSave}
        className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 shadow-md shadow-blue-500/50"
      >
        Save Changes
      </button>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

const PAGE_COMPONENTS = {
  analytics: AnalyticsPage,
  progress: ProgressTracker,
  mocktests: MockTestAnalysisPage, // New page component
  plan: StudyPlan,
  profile: ProfileSettings,
};

const NAV_ITEMS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'progress', label: 'Progress Tracker', icon: LineChart },
  { id: 'mocktests', label: 'Mock Tests', icon: ClipboardCheck }, // New navigation item
  { id: 'plan', label: 'Study Plan', icon: CalendarCheck },
  { id: 'profile', label: 'Profile & Settings', icon: User },
];

const App = () => {
  // Setting the initial page to 'mocktests' to immediately show the new feature
  const [currentPage, setCurrentPage] = useState('mocktests');
  const CurrentComponent = PAGE_COMPONENTS[currentPage];

  useEffect(() => {
    // Set Inter font for the whole app
    document.body.style.fontFamily = 'Inter, sans-serif';
  }, []);

  const { isAuthReady, loading, userId } = useAppContext();
  
  if (!isAuthReady || loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="flex flex-col items-center p-8 bg-white rounded-xl shadow-2xl">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <h1 className="text-xl font-bold text-gray-800">Initializing GATE Prep Platform...</h1>
                <p className="text-sm text-gray-500 mt-2">Connecting to cloud database for secure data access.</p>
              </div>
          </div>
      );
  }


  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Navigation */}
      <nav className="w-16 md:w-64 flex flex-col p-4 bg-white border-r border-gray-100 shadow-lg">
        <div className="flex items-center space-x-2 mb-8 p-1">
          <Zap className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-extrabold text-gray-800 hidden md:inline">GATE Prep</h1>
        </div>
        <div className="flex-grow space-y-2">
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={currentPage === item.id}
              onClick={() => setCurrentPage(item.id)}
            />
          ))}
        </div>
        <div className="mt-8 p-3 border-t">
            <p className="text-xs text-gray-400 hidden md:block">Target: GATE 2026 (ECE)</p>
            <p className="text-xs text-gray-400 hidden md:block">User ID: {userId.substring(0, 8)}...</p>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <CurrentComponent />
      </main>

      {/* Mock Alert Modal (for save confirmation) */}
      <div id="mock-alert-modal" className="hidden fixed bottom-5 right-5 z-50 transition-all duration-500">
        <div className="text-white p-4 rounded-xl shadow-2xl flex items-center space-x-2">
          <CheckCircle className="w-5 h-5" />
          <span id="mock-alert-message" className="text-sm font-medium">Test Saved!</span>
        </div>
      </div>
    </div>
  );
};


// Wraps the main App component with the data provider
const Root = () => (
    <AppProvider>
        <App />
    </AppProvider>
);

export default Root;

