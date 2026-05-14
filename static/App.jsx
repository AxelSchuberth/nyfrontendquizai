const { useEffect, useMemo, useRef, useState } = React;

const TEXT = {
  requestFailed: "Request failed.",
  readingDocuments: "Reading your documents",
  generatingQuiz: "Generating your quiz",
  signingIn: "Signing you in",
  creatingAccount: "Creating your account",
  loadingSavedQuizzes: "Loading your saved quizzes",
  generationCanceled: "Quiz generation was canceled.",
  unsupportedFileType: fileName => `File type not supported for "${fileName}". Only .txt and .pdf are allowed.`,
  duplicateMaterial: "This material is already added.",
  duplicateFile: "That file is already added.",
  maxItems: max => `You can only add up to ${max} files/materials in total.`,
  maxSize: "The selected files are too large. Maximum allowed size is 50 MB.",
  noInput: "You must upload at least one file or choose library material.",
  extraInstructionsTooLong: count => `Your extra instructions are too long (${count} words). Maximum allowed is 5000 words.`,
  noQuestionsGenerated: "No questions could be generated. Try another file or different instructions.",
  generationError: "Something went wrong while generating the quiz.",
  quizTitleDefault: "Quiz",
  generatedQuizTitle: "AI Generated Quiz",
  savedQuizTitle: "Saved Quiz",
  followUpQuizTitle: "Follow-up Quiz",
  savedSuccessfully: "Saved successfully.",
  enterQuizName: "Please enter a quiz name.",
  noSavedQuestions: "No saved questions were found for this quiz.",
  editSavedQuiz: "Edit saved quiz",
  editSavedQuizBody: "Update the name or rating for this saved quiz.",
  updateSavedQuizError: "Could not update the saved quiz. Check that the backend route for updating assignments exists.",
};

const MAX_FILES = 5;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const MAX_CHARS = 5000;

const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || TEXT.requestFailed);
    error.status = response.status;
    throw error;
  }

  return data;
};

function App() {
  const [screen, setScreen] = useState("config");
  const [loadingText, setLoadingText] = useState(TEXT.readingDocuments);
  const [currentUser, setCurrentUser] = useState(null);

  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [libraryMaterials, setLibraryMaterials] = useState([]);
  const [warning, setWarning] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [universities, setUniversities] = useState([]);
  const [courses, setCourses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [selectedUniversity, setSelectedUniversity] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState("");

  const [settings, setSettings] = useState({
    num: "10",
    type: "MCQ",
    difficulty: "Medium",
    language: "Auto",
    examMode: false,
    examTimeLimit: "0",
    examFeedback: true,
    extraInstructions: "",
  });

  const [quizTitle, setQuizTitle] = useState(TEXT.quizTitleDefault);
  const [quizData, setQuizData] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [quizMode, setQuizMode] = useState("new");
  const [activeSavedQuizId, setActiveSavedQuizId] = useState(null);

  const [examRuntime, setExamRuntime] = useState({
    active: false,
    feedback: true,
    remaining: 0,
  });

  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [saveName, setSaveName] = useState("");
  const [saveRating, setSaveRating] = useState("3");
  const [saveMessage, setSaveMessage] = useState("");

  const [savedQuizzes, setSavedQuizzes] = useState([]);
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
    error: "",
  });

  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
    error: "",
  });

  const [pendingSaveAfterLogin, setPendingSaveAfterLogin] = useState(false);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", rating: "3", error: "" });

  useEffect(() => {
    refreshUser();
    loadUniversities();

    return () => stopTimer();
  }, []);

  useEffect(() => {
    if (screen !== "quiz") return;
    if (!examRuntime.active) return;
    if (examRuntime.remaining <= 0) return;

    timerRef.current = setInterval(() => {
      setExamRuntime(prev => {
        if (prev.remaining <= 1) {
          clearInterval(timerRef.current);
          setTimeout(() => finishQuiz(), 0);
          return { ...prev, remaining: 0 };
        }

        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [screen, examRuntime.active, examRuntime.remaining > 0]);

  const refreshUser = async () => {
    try {
      const data = await api("/me");
      setCurrentUser(data.logged_in ? data.user : null);
    } catch {
      setCurrentUser(null);
    }
  };

  const loadUniversities = async () => {
    try {
      setUniversities(await api("/universities"));
    } catch {
      setUniversities([]);
    }
  };

  const loadCourses = async (universityId) => {
    setSelectedUniversity(universityId);
    setSelectedCourse("");
    setSelectedMaterial("");
    setCourses([]);
    setMaterials([]);

    if (!universityId) return;

    try {
      setCourses(await api(`/courses/${universityId}`));
    } catch {
      setCourses([]);
    }
  };

  const loadMaterials = async (courseId) => {
    setSelectedCourse(courseId);
    setSelectedMaterial("");
    setMaterials([]);

    if (!courseId) return;

    try {
      setMaterials(await api(`/materials/${courseId}`));
    } catch {
      setMaterials([]);
    }
  };

  const addLibraryMaterial = async (materialId) => {
    setSelectedMaterial(materialId);

    if (!materialId) return;

    if (libraryMaterials.some(m => String(m.id) === String(materialId))) {
      setWarning(TEXT.duplicateMaterial);
      setSelectedMaterial("");
      return;
    }

    if (uploadedFiles.length + libraryMaterials.length >= MAX_FILES) {
      setWarning(TEXT.maxItems(MAX_FILES));
      setSelectedMaterial("");
      return;
    }

    try {
      const data = await api(`/material/${materialId}`);

      setLibraryMaterials(prev => [
        ...prev,
        {
          id: data.id,
          title: data.title || "Untitled material",
          content: data.content || "",
        },
      ]);

      setWarning("");
      setSelectedMaterial("");
    } catch (error) {
      setWarning(error.message);
      setSelectedMaterial("");
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    let next = [...uploadedFiles];

    for (const file of incoming) {
      const ext = file.name.includes(".")
        ? file.name.split(".").pop().toLowerCase()
        : "";

      const duplicate = next.some(f =>
        f.name === file.name &&
        f.size === file.size &&
        f.lastModified === file.lastModified
      );

      const totalSize = next.reduce((sum, f) => sum + f.size, 0) + file.size;
      const totalItems = next.length + libraryMaterials.length;

      if (!["pdf", "txt"].includes(ext)) {
        setWarning(TEXT.unsupportedFileType(file.name));
        return;
      }

      if (duplicate) {
        setWarning(TEXT.duplicateFile);
        return;
      }

      if (totalItems >= MAX_FILES) {
        setWarning(TEXT.maxItems(MAX_FILES));
        return;
      }

      if (totalSize > MAX_TOTAL_SIZE) {
        setWarning(TEXT.maxSize);
        return;
      }

      next.push(file);
    }

    setUploadedFiles(next);
    setWarning("");
  };

  const resetInputArea = () => {
    setUploadedFiles([]);
    setLibraryMaterials([]);
    setWarning("");
    setSelectedUniversity("");
    setSelectedCourse("");
    setSelectedMaterial("");
    setCourses([]);
    setMaterials([]);

    setSettings({
      num: "10",
      type: "MCQ",
      difficulty: "Medium",
      language: "Auto",
      examMode: false,
      examTimeLimit: "0",
      examFeedback: true,
      extraInstructions: "",
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const generateQuiz = async () => {
    if (uploadedFiles.length === 0 && libraryMaterials.length === 0) {
      setWarning(TEXT.noInput);
      return;
    }

    if (settings.extraInstructions.trim() !== "") {
      const wordCount = settings.extraInstructions.trim().split(/\s+/).length;

      if (wordCount > 5000) {
        setWarning(TEXT.extraInstructionsTooLong(wordCount));
        return;
      }
    }

    const formData = new FormData();

    formData.append("extraInstructions", settings.extraInstructions);
    formData.append("num", settings.num);
    formData.append("type", settings.type);
    formData.append("difficulty", settings.difficulty);
    formData.append("language", settings.language);

    uploadedFiles.forEach(file => {
      formData.append("files", file);
    });

    if (libraryMaterials.length > 0) {
      formData.append("libraryMaterials", JSON.stringify(libraryMaterials));
    }

    setWarning("");
    setIsGenerating(true);
    setLoadingText(TEXT.generatingQuiz);
    setScreen("loading");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await api("/generate-quiz", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!data.questions || data.questions.length === 0) {
        throw new Error(TEXT.noQuestionsGenerated);
      }

      startQuiz(data.title || TEXT.generatedQuizTitle, data.questions, "new", null);
    } catch (error) {
      setScreen("config");
      setWarning(error.name === "AbortError" ? TEXT.generationCanceled : error.message || TEXT.generationError);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const startQuiz = (title, questions, mode = "new", savedId = null) => {
    stopTimer();

    const preparedQuestions = mode === "saved"
      ? shuffleArray(questions).map(shuffleQuestionOptions)
      : questions;

    setQuizTitle(title);
    setQuizData(preparedQuestions);
    setCurrentQuestion(0);
    setUserAnswers(new Array(preparedQuestions.length).fill(null));
    setQuizMode(mode);
    setActiveSavedQuizId(savedId);
    setShowHint(false);
    setSaveMessage("");
    setSaveName(mode === "new" ? title : "");

    const minutes = Number(settings.examTimeLimit);

    setExamRuntime({
      active: settings.examMode,
      feedback: settings.examMode ? settings.examFeedback : true,
      remaining: settings.examMode && minutes > 0 ? minutes * 60 : 0,
    });

    setScreen("quiz");
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const selectAnswer = (answerIndex) => {
    setUserAnswers(prev => {
      if (prev[currentQuestion] !== null && prev[currentQuestion] !== undefined) {
        return prev;
      }

      const next = [...prev];
      next[currentQuestion] = answerIndex;
      return next;
    });

    setShowHint(false);
  };

  const goNext = () => {
    setShowHint(false);

    if (currentQuestion < quizData.length - 1) {
      setCurrentQuestion(q => q + 1);
    } else {
      finishQuiz();
    }
  };

  const goBack = () => {
    if (examRuntime.active) return;

    setShowHint(false);
    setCurrentQuestion(q => Math.max(0, q - 1));
  };

  const score = useMemo(() => {
    return quizData.reduce((sum, q, index) => {
      return sum + (userAnswers[index] === q.correct ? 1 : 0);
    }, 0);
  }, [quizData, userAnswers]);

  const wrongAnswers = useMemo(() => {
    return quizData
      .map((q, index) => ({
        ...q,
        index,
        userAnswer: userAnswers[index],
      }))
      .filter(q => q.userAnswer !== q.correct);
  }, [quizData, userAnswers]);

  const finishQuiz = async () => {
    stopTimer();

    const finalScore = quizData.reduce((sum, q, index) => {
      return sum + (userAnswers[index] === q.correct ? 1 : 0);
    }, 0);

    if (quizMode === "saved" && activeSavedQuizId) {
      try {
        await api(`/update-score/${activeSavedQuizId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            correct_questions: finalScore,
            total_questions: quizData.length,
          }),
        });
      } catch {}
    }

    setScreen("results");

    const percent = quizData.length
      ? Math.round((finalScore / quizData.length) * 100)
      : 0;

    setTimeout(() => {
      if (percent >= 80 && window.confetti) {
        window.confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.65 },
        });
      }

      if (percent <= 20) {
        createRainEffect();
      }
    }, 100);
  };

  const saveQuiz = async () => {
    setSaveMessage("");

    if (!currentUser) {
      setPendingSaveAfterLogin(true);
      setScreen("login");
      return;
    }

    if (!saveName.trim()) {
      setSaveMessage(TEXT.enterQuizName);
      return;
    }

    try {
      await api("/save-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignment_name: saveName.trim(),
          total_questions: quizData.length,
          correct_questions: score,
          star_rating: Number(saveRating),
          quiz_title: quizTitle,
          questions: quizData,
        }),
      });

      setSaveMessage(TEXT.savedSuccessfully);
      await refreshSavedQuizzes();
    } catch (error) {
      setSaveMessage(error.message);
    }
  };

  const refreshSavedQuizzes = async () => {
    const data = await api("/my-quizzes");
    setSavedQuizzes(data.quizzes || []);
  };

  const login = async () => {
    setLoginForm(prev => ({ ...prev, error: "" }));
    setLoadingText(TEXT.signingIn);
    setScreen("loading");

    try {
      const data = await api("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password,
        }),
      });

      setCurrentUser(data.user);
      setLoginForm({ username: "", password: "", error: "" });

      if (pendingSaveAfterLogin) {
        setPendingSaveAfterLogin(false);
        setScreen("results");
      } else {
        setLoadingText(TEXT.loadingSavedQuizzes);
        await refreshSavedQuizzes();
        setScreen("dashboard");
      }
    } catch (error) {
      setLoginForm(prev => ({ ...prev, error: error.message }));
      setScreen("login");
    }
  };

  const register = async () => {
    setRegisterForm(prev => ({ ...prev, error: "" }));
    setLoadingText(TEXT.creatingAccount);
    setScreen("loading");

    try {
      const data = await api("/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: registerForm.username,
          email: registerForm.email,
          password: registerForm.password,
        }),
      });

      setCurrentUser(data.user);
      setRegisterForm({ username: "", email: "", password: "", error: "" });

      if (pendingSaveAfterLogin) {
        setPendingSaveAfterLogin(false);
        setScreen("results");
      } else {
        setLoadingText(TEXT.loadingSavedQuizzes);
        await refreshSavedQuizzes();
        setScreen("dashboard");
      }
    } catch (error) {
      setRegisterForm(prev => ({ ...prev, error: error.message }));
      setScreen("register");
    }
  };

  const logout = async () => {
    try {
      await fetch("/logout", { method: "POST" });
    } catch {}

    setCurrentUser(null);
    setSavedQuizzes([]);
    setScreen("config");
  };

  const openDashboard = async () => {
    if (!currentUser) {
      setScreen("login");
      return;
    }

    setLoadingText(TEXT.loadingSavedQuizzes);
    setScreen("loading");

    try {
      await refreshSavedQuizzes();
      setScreen("dashboard");
    } catch {
      setScreen("config");
    }
  };

  const sortedQuizzes = useMemo(() => {
    return [...savedQuizzes].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortBy === "name") {
        return String(a.name || "").localeCompare(String(b.name || "")) * dir;
      }

      if (sortBy === "score") {
        return ((a.scorePercent || 0) - (b.scorePercent || 0)) * dir;
      }

      if (sortBy === "rating") {
        return ((a.rating || 0) - (b.rating || 0)) * dir;
      }

      return (new Date(a.date || 0) - new Date(b.date || 0)) * dir;
    });
  }, [savedQuizzes, sortBy, sortDir]);

  const startSavedQuiz = async (quiz) => {
    try {
      const data = await api(`/get-saved-quiz/${quiz.id}`);
      const questions = Array.isArray(data) ? data : [];

      if (!questions.length) {
        throw new Error(TEXT.noSavedQuestions);
      }

      startQuiz(quiz.name || TEXT.savedQuizTitle, questions, "saved", quiz.id);
    } catch (error) {
      alert(error.message);
    }
  };

  const updateSavedQuizRequest = async (quizId, payload) => {
    const updateRoutes = [
      `/update-assignment/${quizId}`,
      `/edit-assignment/${quizId}`,
    ];

    let lastError = null;

    for (const route of updateRoutes) {
      try {
        return await api(route, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        lastError = error;

        if (![404, 405].includes(error.status)) {
          throw error;
        }
      }
    }

    throw lastError || new Error(TEXT.updateSavedQuizError);
  };

  const openEditQuiz = (quiz) => {
    setEditTarget(quiz);
    setEditForm({
      name: quiz.name || "",
      rating: String(quiz.rating || 3),
      error: "",
    });
    setModal("edit");
  };

  const updateSavedQuiz = async () => {
    if (!editTarget) return;

    const name = editForm.name.trim();

    if (!name) {
      setEditForm(prev => ({ ...prev, error: TEXT.enterQuizName }));
      return;
    }

    const payload = {
      assignment_name: name,
      star_rating: Number(editForm.rating),
    };

    try {
      await updateSavedQuizRequest(editTarget.id, payload);

      setSavedQuizzes(prev => prev.map(quiz => (
        quiz.id === editTarget.id
          ? { ...quiz, name, rating: Number(editForm.rating) }
          : quiz
      )));

      setEditTarget(null);
      setEditForm({ name: "", rating: "3", error: "" });
      setModal(null);
    } catch (error) {
      setEditForm(prev => ({
        ...prev,
        error: error.message || TEXT.updateSavedQuizError,
      }));
    }
  };

  const deleteQuiz = async () => {
    if (!deleteTarget) return;

    try {
      await api(`/delete-assignment/${deleteTarget.id}`, {
        method: "DELETE",
      });

      setSavedQuizzes(prev => prev.filter(q => q.id !== deleteTarget.id));
    } catch (error) {
      alert(error.message);
    } finally {
      setDeleteTarget(null);
      setModal(null);
    }
  };

  const retryIncorrect = () => {
    const questions = wrongAnswers
      .slice(0, 5)
      .map(({ index, userAnswer, ...q }) => q);

    if (questions.length > 0) {
      startQuiz(TEXT.followUpQuizTitle, questions, "new", null);
    }
  };

  const leaveResults = () => {
    setModal(null);
    resetQuizRuntime();
    setScreen("config");
  };

  const resetQuizRuntime = () => {
    stopTimer();
    setQuizData([]);
    setUserAnswers([]);
    setCurrentQuestion(0);
    setShowHint(false);
    setExamRuntime({
      active: false,
      feedback: true,
      remaining: 0,
    });
  };

  return (
    <>
      <div className="main-wrapper">
        <Navigation
          screen={screen}
          currentUser={currentUser}
          openDashboard={openDashboard}
          logout={logout}
          backHome={() => setScreen("config")}
          endQuiz={() => setModal("exit")}
          exitResults={() => setModal("results-exit")}
        />

        <main className="container">
          {screen === "config" && (
            <ConfigScreen
              settings={settings}
              updateSetting={updateSetting}
              uploadedFiles={uploadedFiles}
              libraryMaterials={libraryMaterials}
              removeFile={index => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
              removeMaterial={index => setLibraryMaterials(prev => prev.filter((_, i) => i !== index))}
              addFiles={addFiles}
              fileInputRef={fileInputRef}
              universities={universities}
              courses={courses}
              materials={materials}
              selectedUniversity={selectedUniversity}
              selectedCourse={selectedCourse}
              selectedMaterial={selectedMaterial}
              loadCourses={loadCourses}
              loadMaterials={loadMaterials}
              addLibraryMaterial={addLibraryMaterial}
              resetInputArea={resetInputArea}
              generateQuiz={generateQuiz}
              warning={warning}
              isGenerating={isGenerating}
            />
          )}

          {screen === "quiz" && (
            <QuizScreen
              quizTitle={quizTitle}
              quizData={quizData}
              currentQuestion={currentQuestion}
              userAnswers={userAnswers}
              selectAnswer={selectAnswer}
              goNext={goNext}
              goBack={goBack}
              showHint={showHint}
              setShowHint={setShowHint}
              examRuntime={examRuntime}
            />
          )}

          {screen === "results" && (
            <ResultsScreen
              quizMode={quizMode}
              score={score}
              quizData={quizData}
              wrongAnswers={wrongAnswers}
              saveName={saveName}
              setSaveName={setSaveName}
              saveRating={saveRating}
              setSaveRating={setSaveRating}
              saveQuiz={saveQuiz}
              saveMessage={saveMessage}
              retryIncorrect={retryIncorrect}
            />
          )}

          {screen === "dashboard" && (
            <DashboardScreen
              currentUser={currentUser}
              sortedQuizzes={sortedQuizzes}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
              startSavedQuiz={startSavedQuiz}
              editQuiz={openEditQuiz}
              askDelete={quiz => {
                setDeleteTarget(quiz);
                setModal("delete");
              }}
            />
          )}

          {screen === "login" && (
            <LoginScreen
              form={loginForm}
              setForm={setLoginForm}
              login={login}
              goRegister={() => setScreen("register")}
              cancel={() => setScreen(pendingSaveAfterLogin ? "results" : "config")}
            />
          )}

          {screen === "register" && (
            <RegisterScreen
              form={registerForm}
              setForm={setRegisterForm}
              register={register}
              goLogin={() => setScreen("login")}
              cancel={() => setScreen(pendingSaveAfterLogin ? "results" : "config")}
            />
          )}
        </main>
      </div>

      {screen === "loading" && (
        <LoadingScreen
          text={loadingText}
          onCancel={cancelGeneration}
          canCancel={isGenerating}
        />
      )}

      {modal === "exit" && (
        <ConfirmModal
          title="End quiz?"
          body="Your progress in this quiz will be lost."
          cancel="Continue"
          confirm="End quiz"
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            resetQuizRuntime();
            setScreen("config");
          }}
        />
      )}

      {modal === "results-exit" && (
        <ConfirmModal
          title="Leave results page?"
          body="Make sure you have saved your quiz if you want to keep it."
          cancel="Go back"
          confirm="Leave"
          onCancel={() => setModal(null)}
          onConfirm={leaveResults}
        />
      )}

      {modal === "edit" && (
        <EditQuizModal
          title={TEXT.editSavedQuiz}
          body={TEXT.editSavedQuizBody}
          form={editForm}
          setForm={setEditForm}
          onCancel={() => {
            setEditTarget(null);
            setEditForm({ name: "", rating: "3", error: "" });
            setModal(null);
          }}
          onConfirm={updateSavedQuiz}
        />
      )}

      {modal === "delete" && (
        <ConfirmModal
          title="Delete quiz?"
          body={`Are you sure you want to delete "${deleteTarget?.name || "this quiz"}"?`}
          cancel="Cancel"
          confirm="Delete"
          onCancel={() => {
            setDeleteTarget(null);
            setModal(null);
          }}
          onConfirm={deleteQuiz}
        />
      )}
    </>
  );
}

function Navigation({ screen, currentUser, openDashboard, logout, backHome, endQuiz, exitResults }) {
  return (
    <nav>
      <div className="nav-left nav-actions">
        {screen === "dashboard" && (
          <button type="button" onClick={backHome}>
            ← Back to start
          </button>
        )}

        {screen === "dashboard" && (
          <button type="button" onClick={logout}>
            Log out
          </button>
        )}

        {screen === "quiz" && (
          <button id="end-quiz-btn" type="button" onClick={endQuiz}>
            End quiz
          </button>
        )}

        {screen === "results" && (
          <button type="button" onClick={exitResults}>
            ← Back to generator
          </button>
        )}
      </div>

      <div className="nav-right">
        {!["quiz", "login", "register", "loading"].includes(screen) && (
          <button className="profile-btn" type="button" onClick={openDashboard}>
            <span className="profile-icon">👤</span>{" "}
            {currentUser ? `${currentUser.user_name}'s Quizzes` : "Log in"}
          </button>
        )}
      </div>
    </nav>
  );
}

function ConfigScreen(props) {
  const {
    settings,
    updateSetting,
    uploadedFiles,
    libraryMaterials,
    removeFile,
    removeMaterial,
    addFiles,
    fileInputRef,
    universities,
    courses,
    materials,
    selectedUniversity,
    selectedCourse,
    selectedMaterial,
    loadCourses,
    loadMaterials,
    addLibraryMaterial,
    resetInputArea,
    generateQuiz,
    warning,
    isGenerating,
  } = props;

  const totalMaterials = uploadedFiles.length + libraryMaterials.length;

  const dropHandlers = {
    onDragOver: e => e.preventDefault(),
    onDrop: e => {
      e.preventDefault();
      addFiles(e.dataTransfer.files);
    },
  };

  return (
    <section id="config-screen" className="home-screen">
      <div className="home-hero">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            <span>AI-powered study sessions</span>
          </div>

          <h1>Create focused quizzes from your course material.</h1>

          <p>
            Upload PDFs, lecture notes or course-library material and turn them into clear practice sessions.
            Get hints, explanations, source references and a stricter exam mode when you want a more realistic test.
          </p>

          <div className="hero-highlights" aria-label="Main features">
            <div className="hero-highlight-card">
              <span>01</span>
              <strong>Collect sources</strong>
              <p>Upload your own notes or choose prepared course material. Combine several sources in one quiz without losing structure.</p>
            </div>

            <div className="hero-highlight-card">
              <span>02</span>
              <strong>Tune the quiz</strong>
              <p>Control question type, difficulty, language and exam mode in a compact setup that stays easy to understand.</p>
            </div>

            <div className="hero-highlight-card">
              <span>03</span>
              <strong>Review smarter</strong>
              <p>Use explanations, sources and follow-up practice so mistakes become focused repetition.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="home-main-grid">
        <div className="source-panel glass-panel">
          <div className="section-kicker">Step 1</div>
          <div className="panel-heading-row">
            <div>
              <h2>Start with your material</h2>
              <p className="muted">Drop in your own files or pick saved material from the course library.</p>
            </div>
          </div>

          <div className="source-choice-grid">
            <div
              className="source-choice-card upload-choice-card"
              {...dropHandlers}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="choice-icon">↥</div>
              <h3>Upload files</h3>
              <p>Add lecture slides, summaries or notes. PDF and TXT files work best.</p>

              <button
                type="button"
                className="small-btn"
                onClick={e => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose files
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".txt,.pdf"
                onChange={e => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="source-choice-card library-choice-card">
              <div className="choice-icon">◎</div>
              <h3>Use course library</h3>
              <p>Choose prepared university material and combine it with your own uploads.</p>

              <div className="library-select-stack">
                <Select
                  value={selectedUniversity}
                  onChange={e => loadCourses(e.target.value)}
                  options={universities.map(u => [u.id, u.name])}
                  placeholder="Select university"
                />

                <Select
                  value={selectedCourse}
                  onChange={e => loadMaterials(e.target.value)}
                  options={courses.map(c => [c.id, c.name])}
                  placeholder="Select course"
                />

                <Select
                  value={selectedMaterial}
                  onChange={e => addLibraryMaterial(e.target.value)}
                  options={materials.map(m => [m.id, m.title])}
                  placeholder="Select material"
                />
              </div>
            </div>
          </div>

          <FileList
            uploadedFiles={uploadedFiles}
            libraryMaterials={libraryMaterials}
            removeFile={removeFile}
            removeMaterial={removeMaterial}
          />

          <div className="source-footer">
            <p className="muted">Supported formats: .txt, .pdf · Max {MAX_FILES} files/materials</p>
            {warning && <p id="file-warning" className="form-warning">{warning}</p>}
          </div>
        </div>

        <div className="settings-panel glass-panel">
          <div className="section-kicker">Step 2</div>
          <h2>Quiz settings</h2>
          <p className="muted">Fine-tune the quiz style before generating.</p>

          <div className="settings-card-inner">
            <div className="config-grid premium-config-grid">
              <LabeledSelect
                label="Questions"
                value={settings.num}
                onChange={e => updateSetting("num", e.target.value)}
                options={["5", "10", "15", "20", "25", "30"]}
              />

              <LabeledSelect
                label="Type"
                value={settings.type}
                onChange={e => updateSetting("type", e.target.value)}
                options={[
                  ["T/F", "True / False"],
                  ["MCQ", "Multiple Choice"],
                ]}
              />

              <LabeledSelect
                label="Difficulty"
                value={settings.difficulty}
                onChange={e => updateSetting("difficulty", e.target.value)}
                options={["Easy", "Medium", "Hard"]}
              />

              <LabeledSelect
                label="Language"
                value={settings.language}
                onChange={e => updateSetting("language", e.target.value)}
                options={[
                  ["Auto", "Auto (recommended)"],
                  "Swedish",
                  "English",
                ]}
              />
            </div>

            <div className="exam-mode-card">
              <div>
                <h3>Exam mode</h3>
                <p className="muted">Turn on a stricter mode with fewer shortcuts and optional time pressure.</p>
              </div>

              <Switch
                checked={settings.examMode}
                onChange={e => updateSetting("examMode", e.target.checked)}
              />
            </div>

            {settings.examMode && (
              <div className="exam-settings premium-exam-settings">
                <div className="config-grid exam-settings-grid">
                  <LabeledSelect
                    label="Time limit"
                    value={settings.examTimeLimit}
                    onChange={e => updateSetting("examTimeLimit", e.target.value)}
                    options={[
                      ["0", "No limit"],
                      ["5", "5 minutes"],
                      ["10", "10 minutes"],
                      ["15", "15 minutes"],
                      ["30", "30 minutes"],
                      ["60", "60 minutes"],
                    ]}
                  />

                  <div className="switch-setting-row">
                    <label className="switch-setting-label">Show explanation</label>

                    <Switch
                      checked={settings.examFeedback}
                      onChange={e => updateSetting("examFeedback", e.target.checked)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="extra-instructions-section premium-extra">
              <h3 className="settings-subheading">Extra instructions</h3>

              <textarea
                rows="3"
                maxLength={MAX_CHARS}
                value={settings.extraInstructions}
                onChange={e => updateSetting("extraInstructions", e.target.value)}
                placeholder="Example: focus on definitions, make the questions harder, avoid asking about exact years..."
              />

              <div className="char-counter">
                <span>{settings.extraInstructions.length}</span> / <span>{MAX_CHARS}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="generate-dock">
        <div>
          <h2>Ready when your material is.</h2>
          <p className="muted">
            {totalMaterials > 0
              ? `${totalMaterials} material${totalMaterials === 1 ? "" : "s"} selected.`
              : "Add at least one file or course material to continue."}
          </p>
        </div>

        <div className="generate-dock-actions">
          <button type="button" onClick={resetInputArea}>
            Reset
          </button>

          <button
            className="primary generate-main-btn"
            type="button"
            disabled={isGenerating}
            onClick={generateQuiz}
          >
            {isGenerating ? "Generating..." : "Generate quiz"}
          </button>
        </div>
      </div>
    </section>
  );
}

function QuizScreen({
  quizTitle,
  quizData,
  currentQuestion,
  userAnswers,
  selectAnswer,
  goNext,
  goBack,
  showHint,
  setShowHint,
  examRuntime,
}) {
  const q = quizData[currentQuestion] || {
    question: "Loading question...",
    options: [],
  };

  const selected = userAnswers[currentQuestion];
  const answered = selected !== null && selected !== undefined;
  const showFeedback = answered && (!examRuntime.active || examRuntime.feedback);
  const progress = quizData.length ? ((currentQuestion + 1) / quizData.length) * 100 : 0;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (answered) return;

      if (e.key === "1") selectAnswer(0);
      if (e.key === "2") selectAnswer(1);
      if (e.key === "3" && q.options?.length > 2) selectAnswer(2);
      if (e.key === "4" && q.options?.length > 3) selectAnswer(3);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [answered, currentQuestion, q]);

  return (
    <section id="quiz-screen">
      <div className="card quiz-card">
        <h2 className="quiz-title">{quizTitle}</h2>

        {examRuntime.active && examRuntime.remaining > 0 && (
          <div className="exam-timer">
            ⏱️ Time remaining:{" "}
            <span id="time-remaining-text">{formatTime(examRuntime.remaining)}</span>
          </div>
        )}

        <div className="progress-bar">
          <div id="progress-fill" style={{ width: `${progress}%` }}></div>
          <span id="progress-text">{currentQuestion + 1}/{quizData.length}</span>
        </div>

        <div className="question-container">
          <h2 id="question-text">{q.question}</h2>
        </div>

        <div className="options-grid">
          {(q.options || []).map((option, index) => {
            let cls = "option";

            if (showFeedback && index === q.correct) {
              cls += " correct";
            }

            if (showFeedback && selected === index && selected !== q.correct) {
              cls += " wrong";
            }

            if (!showFeedback && selected === index) {
              cls += " selected";
            }

            return (
              <button
                key={index}
                className={cls}
                type="button"
                disabled={answered}
                onClick={() => selectAnswer(index)}
              >
                <span className="option-key">[{index + 1}]</span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        {showFeedback && (
          <p id="inline-explanation" className="muted">
            <strong>{selected === q.correct ? "Correct." : "Incorrect."}</strong>
            <br />
            {selected !== q.correct && (
              <>
                Correct answer: {q.options?.[q.correct]}
                <br />
              </>
            )}
            <br />
            {q.explanation}
            {q.source && (
              <>
                <br />
                <br />
                <span className="muted">Source: {q.source}</span>
              </>
            )}
          </p>
        )}

        {showHint && !answered && (
          <div id="hint-box">
            {q.hint || `Look for the part of the material connected to: ${q.source || q.question}`}
          </div>
        )}

        <div className="navigation-row">
          {!examRuntime.active && (
            <button type="button" onClick={goBack} disabled={currentQuestion === 0}>
              ← Back
            </button>
          )}

          {!examRuntime.active && !answered && (
            <button type="button" onClick={() => setShowHint(v => !v)}>
              💡 Hint
            </button>
          )}

          <button className="primary" type="button" onClick={goNext}>
            {currentQuestion === quizData.length - 1 ? "Finish" : "Next →"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultsScreen({
  quizMode,
  score,
  quizData,
  wrongAnswers,
  saveName,
  setSaveName,
  saveRating,
  setSaveRating,
  saveQuiz,
  saveMessage,
  retryIncorrect,
}) {
  const percent = quizData.length ? Math.round((score / quizData.length) * 100) : 0;

  return (
    <section id="results-screen">
      <div className="card result-card">
        <h2 id="result-text">
          Results: {score}/{quizData.length}
          <br />
          {percent}% correct
        </h2>

        {quizMode === "new" && (
          <div className="save-quiz-section">
            <h3>Save this quiz</h3>

            <div className="save-form">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Name your quiz"
                maxLength="50"
              />

              <div className="rating-box">
                <label>Rate the difficulty:</label>

                <select value={saveRating} onChange={e => setSaveRating(e.target.value)}>
                  <option value="5">⭐⭐⭐⭐⭐ (Perfect)</option>
                  <option value="4">⭐⭐⭐⭐ (Good)</option>
                  <option value="3">⭐⭐⭐ (Okay)</option>
                  <option value="2">⭐⭐ (Needs work)</option>
                  <option value="1">⭐ (Poor)</option>
                </select>
              </div>

              <button className="primary" type="button" onClick={saveQuiz}>
                Save to My Quizzes
              </button>

              {saveMessage && <p className="muted">{saveMessage}</p>}
            </div>
          </div>
        )}
      </div>

      <div id="wrong-answers-list">
        <h3>Questions to review:</h3>

        {wrongAnswers.length === 0 ? (
          <div className="wrong-answer-item">
            <strong>No incorrect answers 🎉</strong>
          </div>
        ) : (
          wrongAnswers.map(q => (
            <div className="wrong-answer-item" key={q.index}>
              <strong>Question {q.index + 1}:</strong> {q.question}
              <br />
              <span className="muted">
                Your answer: {q.options?.[q.userAnswer] || "Skipped"}
              </span>
              <br />
              <span className="muted">
                Correct answer: {q.options?.[q.correct]}
              </span>
              <br />
              <br />
              <span>{q.explanation}</span>
              {q.source && (
                <>
                  <br />
                  <span className="muted">Source: {q.source}</span>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {wrongAnswers.length > 0 && quizMode === "new" && (
        <div className="navigation-row results-navigation-row">
          <button className="primary" type="button" onClick={retryIncorrect}>
            Follow Up Quiz ({Math.min(5, wrongAnswers.length)})
          </button>
        </div>
      )}
    </section>
  );
}

function DashboardScreen({
  currentUser,
  sortedQuizzes,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  startSavedQuiz,
  editQuiz,
  askDelete,
}) {
  return (
    <section id="dashboard-screen">
      <div className="card dashboard-header">
        <h2>{currentUser ? `${currentUser.user_name}'s Saved Quizzes` : "My Saved Quizzes"}</h2>

        <div className="dashboard-sort-row">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date">Sort by: Date</option>
            <option value="name">Sort by: Name</option>
            <option value="score">Sort by: Score</option>
            <option value="rating">Sort by: Rating</option>
          </select>

          <button
            className="small-btn sort-dir-btn"
            type="button"
            onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
          >
            {sortDir === "desc" ? "↓ Descending" : "↑ Ascending"}
          </button>
        </div>
      </div>

      <div className="dashboard-list">
        {sortedQuizzes.length === 0 ? (
          <div className="card">
            <p className="muted">No saved quizzes yet.</p>
          </div>
        ) : (
          sortedQuizzes.map(quiz => (
            <div className="saved-quiz-card" key={quiz.id}>
              <div className="quiz-info">
                <h3>{quiz.name}</h3>
                <p className="muted">
                  {formatDate(quiz.date)} · {quiz.numQuestions || 0} questions · Recent score:{" "}
                  {Math.round(quiz.scorePercent || 0)}% · Rating: {"⭐".repeat(quiz.rating || 0)}
                </p>
              </div>

              <div className="dashboard-button-group">
                <button className="primary small-btn" type="button" onClick={() => startSavedQuiz(quiz)}>
                  Redo
                </button>

                <button className="small-btn" type="button" onClick={() => editQuiz(quiz)}>
                  Edit
                </button>

                <button className="small-btn delete-btn" type="button" onClick={() => askDelete(quiz)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function LoginScreen({ form, setForm, login, goRegister, cancel }) {
  return (
    <section id="login-screen">
      <div className="card login-card">
        <h2>Log in</h2>

        <div className="save-form">
          <input
            type="text"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            placeholder="Username"
          />

          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder="Password"
          />

          <button className="primary" type="button" onClick={login}>
            Log in
          </button>

          {form.error && <p className="form-warning">{form.error}</p>}

          <button className="small-btn" type="button" onClick={goRegister}>
            Create an account
          </button>

          <button className="small-btn" type="button" onClick={cancel}>
            ← Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

function RegisterScreen({ form, setForm, register, goLogin, cancel }) {
  return (
    <section id="register-screen">
      <div className="card login-card">
        <h2>Create an account</h2>

        <div className="save-form">
          <input
            type="text"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            placeholder="Username"
          />

          <input
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
          />

          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder="Password"
          />

          <button className="primary" type="button" onClick={register}>
            Register
          </button>

          {form.error && <p className="form-warning">{form.error}</p>}

          <button className="small-btn" type="button" onClick={goLogin}>
            Already have an account?
          </button>

          <button className="small-btn" type="button" onClick={cancel}>
            ← Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

function FileList({ uploadedFiles, libraryMaterials, removeFile, removeMaterial }) {
  if (uploadedFiles.length === 0 && libraryMaterials.length === 0) {
    return null;
  }

  return (
    <div className="file-list-container premium-file-list">
      <div id="file-list">
        {libraryMaterials.map((material, index) => (
          <div className="file-item animate-in" key={`library-${material.id}`}>
            <span>Library: {material.title}</span>

            <button
              type="button"
              className="file-remove-btn"
              onClick={() => removeMaterial(index)}
            >
              X
            </button>
          </div>
        ))}

        {uploadedFiles.map((file, index) => (
          <div className="file-item animate-in" key={`${file.name}-${file.size}-${index}`}>
            <span>{file.name} ({formatFileSize(file.size)})</span>

            <button
              type="button"
              className="file-remove-btn"
              onClick={() => removeFile(index)}
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <div className="select-wrapper">
      <label>{label}</label>

      <select value={value} onChange={onChange}>
        {options.map(option =>
          Array.isArray(option) ? (
            <option key={option[0]} value={option[0]}>
              {option[1]}
            </option>
          ) : (
            <option key={option} value={option}>
              {option}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="select-wrapper">
      <select value={value} onChange={onChange}>
        <option value="">{placeholder}</option>

        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="slider"></span>
    </label>
  );
}

function ConfirmModal({ title, body, cancel, confirm, onCancel, onConfirm }) {
  return (
    <div className="modal" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{body}</p>

        <div className="modal-buttons">
          <button type="button" onClick={onCancel}>
            {cancel}
          </button>

          <button className="primary" type="button" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditQuizModal({ title, body, form, setForm, onCancel, onConfirm }) {
  return (
    <div className="modal" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{body}</p>

        <div className="save-form">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value, error: "" })}
            placeholder="Quiz name"
            maxLength="50"
          />

          <div className="rating-box">
            <label>Rating:</label>

            <select
              value={form.rating}
              onChange={e => setForm({ ...form, rating: e.target.value, error: "" })}
            >
              <option value="5">⭐⭐⭐⭐⭐ (Perfect)</option>
              <option value="4">⭐⭐⭐⭐ (Good)</option>
              <option value="3">⭐⭐⭐ (Okay)</option>
              <option value="2">⭐⭐ (Needs work)</option>
              <option value="1">⭐ (Poor)</option>
            </select>
          </div>

          {form.error && <p className="form-warning">{form.error}</p>}
        </div>

        <div className="modal-buttons">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>

          <button className="primary" type="button" onClick={onConfirm}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ text, onCancel, canCancel }) {
  return (
    <div id="loading-screen">
      <div className="loading-card premium-loading-card">
        <div className="loading-visual" aria-hidden="true">
          <div className="loading-orb premium-loading-orb"></div>
          <div className="loading-ring loading-ring-one"></div>
          <div className="loading-ring loading-ring-two"></div>
        </div>

        <div className="loading-copy">
          <span className="loading-kicker">AI is preparing your quiz</span>
          <h2>
            {text}
            <span className="animated-dots"></span>
          </h2>
          <p className="muted">
            Reading your material, finding key points and shaping useful questions.
          </p>
        </div>

        <div className="loading-progress" aria-hidden="true">
          <span></span>
        </div>

        <div className="loading-steps" aria-label="Loading steps">
          <span>Reading sources</span>
          <span>Finding concepts</span>
          <span>Writing questions</span>
        </div>

        {canCancel && (
          <button className="small-btn loading-cancel-btn" type="button" onClick={onCancel}>
            Cancel generation
          </button>
        )}
      </div>
    </div>
  );
}

function shuffleArray(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function shuffleQuestionOptions(question) {
  if (!question.options || question.options.length <= 2) {
    return question;
  }

  const indexedOptions = question.options.map((text, index) => ({
    text,
    originalIndex: index,
  }));

  const shuffledOptions = shuffleArray(indexedOptions);

  const newCorrectIndex = shuffledOptions.findIndex(
    option => option.originalIndex === question.correct
  );

  return {
    ...question,
    options: shuffledOptions.map(option => option.text),
    correct: newCorrectIndex,
  };
}

function createRainEffect() {
  const rainContainer = document.createElement("div");
  rainContainer.className = "rain-container";
  document.body.appendChild(rainContainer);

  for (let i = 0; i < 100; i++) {
    const drop = document.createElement("div");
    drop.className = "drop";
    drop.style.left = `${Math.floor(Math.random() * 100)}%`;
    drop.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
    drop.style.animationDelay = `${Math.random() * 2}s`;
    rainContainer.appendChild(drop);
  }

  setTimeout(() => {
    rainContainer.style.opacity = "0";
    rainContainer.style.transition = "opacity 1s ease";
    setTimeout(() => rainContainer.remove(), 1000);
  }, 4000);
}

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(date) {
  if (!date) return "Unknown date";

  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);