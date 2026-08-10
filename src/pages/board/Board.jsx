import { useEffect, useMemo, useRef, useState } from "react";
import { boardPostApi } from "../../api/client";
import { isGuestSession } from "../../api/auth";
import "../../styles/board/board.css";

const BOARD_TABS = [
    { id: "notice", label: "공지사항" },
    { id: "manual", label: "사용 매뉴얼" },
    { id: "archive", label: "자유 게시판" },
];

const STORAGE_KEY = "laro-board-posts";
const MAX_FILE_SIZE = 2 * 1024 * 1024;

const normalizeKeyword = (value) => value.trim().toLowerCase();

const NOTICES = [
    {
        id: 1,
        category: "필독",
        title: "LARO 서비스 이용 안내",
        author: "관리자",
        date: "2026.08.05",
        pinned: true,
        content: "LARO는 창고 운영, 로봇 관리, 시뮬레이션 및 작업 최적화를 지원하는 서비스입니다. 서비스 이용 전 창고와 로봇 정보를 먼저 등록해 주세요.",
    },
    {
        id: 2,
        category: "업데이트",
        title: "AI 시뮬레이션 기능 업데이트 안내",
        author: "관리자",
        date: "2026.08.04",
        pinned: true,
        content: "AI 계획 생성, 작업 배정, 충돌 검증 및 재계획 기능이 업데이트되었습니다. 시뮬레이션 메뉴에서 확인할 수 있습니다.",
    },
    {
        id: 3,
        category: "점검",
        title: "정기 점검 예정 안내",
        author: "관리자",
        date: "2026.08.01",
        pinned: false,
        content: "서비스 안정화를 위한 정기 점검이 예정되어 있습니다. 점검 시간에는 일부 기능 이용이 제한될 수 있습니다.",
    },
    {
        id: 4,
        category: "안내",
        title: "창고 설계 데이터 등록 방법",
        author: "관리자",
        date: "2026.07.30",
        pinned: false,
        content: "창고 메뉴에서 창고를 생성한 뒤 노드, 통로, 랙, 입출고장 및 충전소 정보를 등록할 수 있습니다.",
    },
];

const MANUALS = [
    {
        id: 1,
        title: "시뮬레이션 시작",
        description: "창고와 로봇을 선택하고 시뮬레이션을 실행하는 방법입니다.",
        steps: [
            "시뮬레이션 메뉴로 이동합니다.",
            "실행할 창고를 선택합니다.",
            "작업 또는 자연어 명령을 입력합니다.",
            "계획 생성 결과를 확인한 뒤 시작 버튼을 누릅니다.",
        ],
    },
    {
        id: 2,
        title: "창고 등록 및 수정",
        description: "창고 지도와 시설 정보를 등록하고 수정하는 방법입니다.",
        steps: [
            "창고 메뉴에서 신규 창고 등록을 선택합니다.",
            "창고명과 기본 정보를 입력합니다.",
            "랙, 통로, 충전소, 입고장과 출고장을 배치합니다.",
            "저장 후 지도 검증 결과를 확인합니다.",
        ],
    },
    {
        id: 3,
        title: "로봇 관리",
        description: "로봇 상태와 배터리, 현재 위치를 확인하는 방법입니다.",
        steps: [
            "로봇 메뉴로 이동합니다.",
            "대상 창고를 선택합니다.",
            "로봇 상태, 배터리와 현재 작업을 확인합니다.",
            "고장 또는 충전이 필요한 로봇을 점검합니다.",
        ],
    },
    {
        id: 4,
        title: "재계획 실행",
        description: "고장이나 장애물 발생 시 계획을 다시 생성하는 방법입니다.",
        steps: [
            "시뮬레이션 이벤트에서 문제 상황을 확인합니다.",
            "재계획 버튼을 선택합니다.",
            "변경된 로봇 배정과 경로를 검토합니다.",
            "검증 통과 후 재계획을 적용합니다.",
        ],
    },
];

const formatFileSize = (size) => {
    if (!size) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

function Board() {
    const fileInputRef = useRef(null);

    const [activeTab, setActiveTab] = useState("notice");

    const [noticeKeyword, setNoticeKeyword] = useState("");
    const [selectedNotice, setSelectedNotice] = useState(null);

    const [archivePosts, setArchivePosts] = useState([]);
    const guest = isGuestSession();

    const [selectedArchivePost, setSelectedArchivePost] = useState(null);

    const [archiveKeyword, setArchiveKeyword] = useState("");

    const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

    const [editingPostId, setEditingPostId] = useState(null);

    const [postTitle, setPostTitle] = useState("");
    const [postContent, setPostContent] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState("");

    const editingPost = editingPostId
        ? archivePosts.find((post) => post.id === editingPostId) ?? null
        : null;

    const formatPost = (post) => ({
        ...post,
        createdAt: post.createdAt
            ? new Date(post.createdAt).toLocaleString("ko-KR")
            : "-",
        updatedAt: post.updatedAt
            ? new Date(post.updatedAt).toLocaleString("ko-KR")
            : null,
        attachment: post.attachment
            ? {
                  id: post.attachment.id,
                  name: post.attachment.fileName,
                  size: post.attachment.size,
                  type: post.attachment.contentType,
              }
            : null,
    });

    const fetchArchivePosts = async () => {
        try {
            const posts = await boardPostApi.getAll();
            setArchivePosts(Array.isArray(posts) ? posts.map(formatPost) : []);
        } catch (error) {
            console.error("게시글 조회 실패:", error);
            setFormError(error.message || "게시글을 불러오지 못했습니다.");
        }
    };

    useEffect(() => {
        fetchArchivePosts();
    }, []);

    const filteredNotices = useMemo(() => {
        const normalizedKeyword = normalizeKeyword(noticeKeyword);

        if (!normalizedKeyword) return NOTICES;

        return NOTICES.filter((notice) =>
            `${notice.category} ${notice.title} ${notice.author}`
                .toLowerCase()
                .includes(normalizedKeyword)
        );
    }, [noticeKeyword]);

    const filteredArchivePosts = useMemo(() => {
        const normalizedKeyword = normalizeKeyword(archiveKeyword);

        if (!normalizedKeyword) return archivePosts;

        return archivePosts.filter((post) =>
            `${post.title} ${post.content}`
                .toLowerCase()
                .includes(normalizedKeyword)
        );
    }, [archiveKeyword, archivePosts]);

    const resetFileInput = () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const resetPostForm = () => {
        setPostTitle("");
        setPostContent("");
        setSelectedFile(null);
        setFormError("");
        resetFileInput();
    };

    const handleOpenWriteModal = () => {
        if (guest) return;
        resetPostForm();
        setEditingPostId(null);
        setFormSuccess("");
        setIsWriteModalOpen(true);
    };

    const handleOpenEditModal = (post) => {
        setEditingPostId(post.id);
        setPostTitle(post.title);
        setPostContent(post.content);
        setSelectedFile(null);
        setFormError("");
        setFormSuccess("");

        resetFileInput();
        setIsWriteModalOpen(true);
    };

    const handleCloseWriteModal = () => {
        resetPostForm();
        setEditingPostId(null);
        setIsWriteModalOpen(false);
    };

    const handleModalBackgroundClick = (event) => {
        if (event.target === event.currentTarget) handleCloseWriteModal();
    };

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        setSelectedNotice(null);
        setSelectedArchivePost(null);
        setFormError("");
        setFormSuccess("");
        setEditingPostId(null);
        setIsWriteModalOpen(false);
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0] ?? null;

        setFormError("");

        if (!file) {
            setSelectedFile(null);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setSelectedFile(null);

            setFormError("첨부파일은 최대 2MB까지 등록할 수 있습니다.");

            event.target.value = "";
            return;
        }

        setSelectedFile(file);
    };

    const handlePostSubmit = async (event) => {
        event.preventDefault();

        const normalizedTitle = postTitle.trim();
        const normalizedContent = postContent.trim();

        setFormError("");

        if (!normalizedTitle) {
            setFormError("게시글 제목을 입력해 주세요.");
            return;
        }

        if (!normalizedContent) {
            setFormError("게시글 내용을 입력해 주세요.");
            return;
        }

        try {
            const payload = {
                title: normalizedTitle,
                content: normalizedContent,
            };

            let savedPost;
            if (editingPostId) {
                savedPost = await boardPostApi.update(editingPostId, payload);
                setFormSuccess("게시글이 수정되었습니다.");
            } else {
                savedPost = await boardPostApi.create(payload);
                setFormSuccess("게시글이 등록되었습니다.");
                if (selectedFile) {
                    setEditingPostId(savedPost.id);
                }
            }

            if (selectedFile) {
                savedPost = await boardPostApi.uploadAttachment(savedPost.id, selectedFile);
            }

            if (editingPostId) {
                setSelectedArchivePost(formatPost(savedPost));
            }

            handleCloseWriteModal();
            await fetchArchivePosts();
        } catch (error) {
            console.error("게시글 등록 또는 수정 실패:", error);

            setFormError("게시글을 저장하는 중 오류가 발생했습니다.");
        }
    };

    const handleDeletePost = async (postId) => {
        const shouldDelete = window.confirm("이 게시글을 삭제하시겠습니까?");

        if (!shouldDelete) return;

        try {
            await boardPostApi.remove(postId);
            if (selectedArchivePost?.id === postId) {
                setSelectedArchivePost(null);
            }
            setFormSuccess("게시글이 삭제되었습니다.");
            await fetchArchivePosts();
        } catch (error) {
            console.error("게시글 삭제 실패:", error);
            setFormError(error.message || "게시글 삭제에 실패했습니다.");
        }
    };

    const handleDownloadAttachment = async (post) => {
        try {
            const blob = await boardPostApi.downloadAttachment(post.id);
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = post.attachment.name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            console.error("첨부파일 다운로드 실패:", error);
            setFormError(error.message || "첨부파일 다운로드에 실패했습니다.");
        }
    };

    const handleDeleteAttachment = async () => {
        if (!editingPostId || !editingPost?.attachment) return;
        try {
            await boardPostApi.deleteAttachment(editingPostId);
            setArchivePosts((posts) => posts.map((post) =>
                post.id === editingPostId ? { ...post, attachment: null } : post
            ));
            setSelectedArchivePost((post) =>
                post?.id === editingPostId ? { ...post, attachment: null } : post
            );
            setFormSuccess("첨부파일이 삭제되었습니다.");
        } catch (error) {
            console.error("첨부파일 삭제 실패:", error);
            setFormError(error.message || "첨부파일 삭제에 실패했습니다.");
        }
    };

    const getPostNumber = (postId) => {
        const postIndex = archivePosts.findIndex((post) => post.id === postId);

        return postIndex >= 0 ? archivePosts.length - postIndex : "-";
    };

    return (
        <section className="board-page">
            <header className="board-page-header">
                <div>
                    <h1>지원센터</h1>

                    <p>공지사항, 사용 매뉴얼과 자유 게시판을 확인할 수 있습니다.</p>
                </div>
            </header>

            <div
                className="board-tabs"
                role="tablist"
                aria-label="지원센터 메뉴"
            >
                {BOARD_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`board-tab ${
                            activeTab === tab.id
                                ? "is-active"
                                : ""
                        }`}
                        onClick={() => handleTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "notice" && (
                <div className="board-panel">
                    {selectedNotice ? (
                        <article className="notice-detail">
                            <div className="notice-detail-heading">
                                <div>
                                    <span className="notice-category">
                                        {selectedNotice.category}
                                    </span>

                                    <h2>
                                        {selectedNotice.title}
                                    </h2>

                                    <p>
                                        {selectedNotice.author} · {selectedNotice.date}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="board-secondary-button"
                                    onClick={() => setSelectedNotice(null)}
                                >
                                    목록으로
                                </button>
                            </div>

                            <div className="notice-detail-content">
                                {selectedNotice.content}
                            </div>
                        </article>
                    ) : (
                        <>
                            <div className="board-toolbar">
                                <div>
                                    <h2>공지사항</h2>

                                    <p>서비스 주요 소식과 점검 내용을 확인합니다.</p>
                                </div>

                                <label className="board-search">
                                    <span className="sr-only">
                                        공지사항 검색
                                    </span>

                                    <input
                                        type="search"
                                        value={noticeKeyword}
                                        onChange={(event) => setNoticeKeyword(event.target.value)}
                                        placeholder="제목 또는 분류 검색"
                                    />
                                </label>
                            </div>

                            <div className="board-table-wrapper">
                                <table className="board-table notice-table">
                                    <thead>
                                        <tr>
                                            <th>번호</th>
                                            <th>분류</th>
                                            <th>제목</th>
                                            <th>작성자</th>
                                            <th>작성일</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredNotices.length > 0 ? (
                                            filteredNotices.map(
                                                (notice) => (
                                                    <tr
                                                        key={notice.id}
                                                    >
                                                        <td>
                                                            {notice.pinned
                                                                ? "공지"
                                                                : notice.id}
                                                        </td>

                                                        <td>
                                                            <span className="notice-category">
                                                                {notice.category}
                                                            </span>
                                                        </td>

                                                        <td className="board-title-cell">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setSelectedNotice(
                                                                        notice
                                                                    )
                                                                }
                                                            >
                                                                {notice.title}
                                                            </button>
                                                        </td>

                                                        <td>
                                                            {notice.author}
                                                        </td>

                                                        <td>
                                                            {notice.date}
                                                        </td>
                                                    </tr>
                                                )
                                            )
                                        ) : (
                                            <tr>
                                                <td
                                                    className="board-empty"
                                                    colSpan="5"
                                                >
                                                    검색 결과가
                                                    없습니다.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "manual" && (
                <div className="board-panel">
                    <div className="board-toolbar">
                        <div>
                            <h2>사용 매뉴얼</h2>

                            <p>주요 기능별 이용 순서를 확인합니다.</p>
                        </div>
                    </div>

                    <div className="manual-grid">
                        {MANUALS.map((manual) => (
                            <article
                                className="manual-card"
                                key={manual.id}
                            >
                                <span className="manual-number">
                                    {String(manual.id).padStart(
                                        2,
                                        "0"
                                    )}
                                </span>

                                <h3>{manual.title}</h3>
                                <p>{manual.description}</p>

                                <ol>
                                    {manual.steps.map(
                                        (step, index) => (
                                            <li key={step}>
                                                <span>
                                                    {index + 1}
                                                </span>

                                                {step}
                                            </li>
                                        )
                                    )}
                                </ol>
                            </article>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === "archive" && (
                <div className="board-panel archive-panel">
                    {selectedArchivePost ? (
                        <article className="archive-detail">
                            <div className="archive-detail-heading">
                                <div>
                                    <span className="archive-category">
                                        자유 게시판
                                    </span>

                                    <h2>
                                        {selectedArchivePost.title}
                                    </h2>

                                    <p>
                                        {selectedArchivePost.authorName || "탈퇴한 사용자"}
                                        {" · 작성 "}
                                        {selectedArchivePost.createdAt}

                                        {selectedArchivePost.updatedAt &&
                                            ` · 수정 ${selectedArchivePost.updatedAt}`}
                                    </p>
                                </div>

                                <div className="archive-detail-actions">
                                    <button
                                        type="button"
                                        className="board-secondary-button"
                                        onClick={() => setSelectedArchivePost(null)}
                                    >
                                        목록으로
                                    </button>

                                    {selectedArchivePost.mine && (
                                        <>
                                            <button
                                                type="button"
                                                className="archive-edit-button"
                                                onClick={() => handleOpenEditModal(selectedArchivePost)}
                                            >
                                                수정
                                            </button>

                                            <button
                                                type="button"
                                                className="board-danger-button"
                                                onClick={() => handleDeletePost(selectedArchivePost.id)}
                                            >
                                                삭제
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="archive-detail-content">
                                {selectedArchivePost.content}
                            </div>

                            {selectedArchivePost.attachment && (
                                <div className="archive-detail-attachment">
                                    <div>
                                        <span>첨부파일</span>

                                        <strong>
                                            {selectedArchivePost.attachment.name}
                                        </strong>

                                        <small>
                                            {formatFileSize(
                                                selectedArchivePost
                                                    .attachment
                                                    .size
                                            )}
                                        </small>
                                    </div>

                                    <button
                                        type="button"
                                        className="board-secondary-button"
                                        onClick={() => handleDownloadAttachment(selectedArchivePost)}
                                    >
                                        다운로드
                                    </button>
                                </div>
                            )}
                        </article>
                    ) : (
                        <>
                            <div className="board-toolbar archive-toolbar">
                                <div>
                                    <h2>자유 게시판</h2>

                                    <p>게시글과 관련 파일을 등록하고 관리합니다.</p>
                                </div>

                                <div className="archive-toolbar-actions">
                                    <label className="board-search">
                                        <span className="sr-only">
                                            자유 게시판 검색
                                        </span>

                                        <input
                                            type="search"
                                            value={archiveKeyword}
                                            onChange={(event) =>
                                                setArchiveKeyword(
                                                    event.target
                                                        .value
                                                )}
                                            placeholder="제목 또는 내용 검색"
                                        />
                                    </label>

                                    {!guest && (
                                        <button
                                            type="button"
                                            className="archive-new-button"
                                            onClick={handleOpenWriteModal}
                                        >
                                            새 글 작성
                                        </button>
                                    )}
                                </div>
                            </div>

                            {formSuccess && (
                                <p
                                    className="archive-list-message"
                                    role="status"
                                >
                                    {formSuccess}
                                </p>
                            )}

                            <div className="archive-list-section">
                                <div className="archive-list-summary">
                                    <strong>등록된 자료</strong>

                                    <span>
                                        총 {archivePosts.length}개
                                    </span>
                                </div>

                                <div className="board-table-wrapper">
                                    <table className="board-table archive-table">
                                        <thead>
                                            <tr>
                                                <th>번호</th>
                                                <th>제목</th>
                                                <th>작성자</th>
                                                <th>첨부파일</th>
                                                <th>작성일</th>
                                                <th>관리</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {filteredArchivePosts.length > 0 ? (
                                                filteredArchivePosts.map(
                                                    (post) => (
                                                        <tr
                                                            key={post.id}
                                                        >
                                                            <td>
                                                                {getPostNumber(
                                                                    post.id
                                                                )}
                                                            </td>

                                                            <td className="board-title-cell">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setSelectedArchivePost(
                                                                            post
                                                                        )
                                                                    }
                                                                >
                                                                    {post.title}
                                                                </button>
                                                            </td>

                                                            <td>
                                                                {post.authorName || "탈퇴한 사용자"}
                                                            </td>

                                                            <td>
                                                                {post.attachment ? post.attachment.name : "-"}
                                                            </td>

                                                            <td>
                                                                {post.createdAt}
                                                            </td>

                                                            <td>
                                                                {post.mine && (
                                                                <div className="archive-manage-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="archive-edit-button"
                                                                        onClick={() => handleOpenEditModal(post)}
                                                                    >
                                                                        수정
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className="archive-delete-button"
                                                                        onClick={() => handleDeletePost(post.id)}
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                )
                                            ) : (
                                                <tr>
                                                    <td
                                                        className="board-empty"
                                                        colSpan="6"
                                                    >
                                                        등록된 게시글이
                                                        없습니다.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "archive" &&
                isWriteModalOpen && (
                    <div
                        className="archive-modal-overlay"
                        onMouseDown={handleModalBackgroundClick}
                    >
                        <div
                            className="archive-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="archive-modal-title"
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <div className="archive-modal-header">
                                <div>
                                    <h2 id="archive-modal-title">
                                        {editingPostId ? "게시글 수정" : "새 글 작성"}
                                    </h2>

                                    <p>
                                        {editingPostId ? "게시글 내용과 첨부파일을 수정합니다." : "게시글과 첨부파일을 등록합니다."}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="archive-modal-close"
                                    onClick={handleCloseWriteModal}
                                    aria-label="팝업 닫기"
                                >
                                    ×
                                </button>
                            </div>

                            <form
                                className="archive-modal-form"
                                onSubmit={handlePostSubmit}
                            >
                                <label className="archive-form-field">
                                    <span>제목</span>

                                    <input
                                        type="text"
                                        value={postTitle}
                                        onChange={(event) => setPostTitle(event.target.value)}
                                        placeholder="게시글 제목을 입력하세요."
                                        maxLength={100}
                                        autoFocus
                                    />
                                </label>

                                <label className="archive-form-field">
                                    <span>내용</span>

                                    <textarea
                                        value={postContent}
                                        onChange={(event) => setPostContent(event.target.value)}
                                        placeholder="게시글 내용을 입력하세요."
                                        rows={9}
                                        maxLength={2000}
                                    />
                                </label>

                                <label className="archive-form-field">
                                    <span>첨부파일</span>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        onChange={handleFileChange}
                                    />

                                    <small>
                                        파일 1개, 최대 2MB까지 등록할 수 있습니다.
                                        {editingPostId && " 새 파일을 선택하지 않으면 기존 파일이 유지됩니다."}
                                    </small>
                                </label>

                                {selectedFile && (
                                    <div className="archive-selected-file">
                                        <strong>{selectedFile.name}</strong>

                                        <span>{formatFileSize(selectedFile.size)}</span>
                                    </div>
                                )}

                                {editingPostId && !selectedFile && editingPost?.attachment && (
                                    <div className="archive-current-file">
                                        <span>현재 첨부파일</span>
                                        <strong>{editingPost.attachment.name}</strong>
                                        <button
                                            type="button"
                                            className="board-danger-button"
                                            onClick={handleDeleteAttachment}
                                        >
                                            첨부파일 삭제
                                        </button>
                                    </div>
                                )}

                                {formError && (
                                    <p
                                        className="archive-message is-error"
                                        role="alert"
                                    >
                                        {formError}
                                    </p>
                                )}

                                <div className="archive-modal-footer">
                                    <button
                                        type="button"
                                        className="board-secondary-button"
                                        onClick={handleCloseWriteModal}
                                    >
                                        취소
                                    </button>

                                    <button
                                        type="submit"
                                        className="archive-submit-button"
                                    >
                                        {editingPostId ? "수정 완료" : "게시글 등록"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
        </section>
    );
}

export default Board;
