# language: en

@sprint-1 @f001 @frontend
Feature: F-001 Vite + React 專案骨架
  As a 單人使用者
  I want 一個 React app 骨架取代既有 single-page HTML
  So that 後續分頁功能可以獨立開發

  Background:
    Given backend 已在 localhost:8080 啟動
    And web/dist/ 已 build 完成

  Scenario: 訪問首頁顯示新版 App
    When 使用者瀏覽 "http://localhost:8080/"
    Then 應該看到 React app shell
    And 頁面標題包含 "Google Chat Agent"
    And 頂部 nav 顯示「Approvals / Sent / Settings」三個連結

  Scenario: Approvals 分頁可訪問
    When 使用者點擊頂部 nav 的 "Approvals"
    Then URL 變成 "/approvals"
    And 主要內容區渲染 Approvals placeholder 或實際內容

  Scenario: Sent 分頁可訪問
    When 使用者點擊頂部 nav 的 "Sent"
    Then URL 變成 "/sent"

  Scenario: Settings 分頁可訪問
    When 使用者點擊頂部 nav 的 "Settings"
    Then URL 變成 "/settings"

  Scenario: 重新整理保留路由
    Given 使用者目前在 "/settings"
    When 使用者按下 F5 重新整理
    Then URL 仍是 "/settings"
    And 不會出現 404

  Scenario: WebSocket 連線狀態顯示
    Given backend 接受 /ws/ui 連線
    When app 載入完成
    Then 頂部 nav 顯示 connection badge 為「已連線」
    When backend 中斷
    Then connection badge 變成「離線」於 5 秒內

  Scenario: Auto-mode toggle 與 backend 同步
    Given backend 目前 auto_mode=false
    When 使用者點擊頂部 nav 的 auto-mode toggle
    Then 發送 PATCH /api/settings/auto-mode 或同等 endpoint
    And toggle 視覺切換為 on
    And backend 設定持久化

  Scenario: 開發模式 Vite proxy 轉送 API
    Given vite dev server 在 :5173 運行
    When 前端呼叫 fetch("/api/inbox")
    Then 請求被 proxy 到 http://localhost:8080/api/inbox
    And 收到 200 回應
