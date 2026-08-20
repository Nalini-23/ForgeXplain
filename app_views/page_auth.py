"""
page_auth.py
-------------
Renders Login, Sign Up, and Forgot Password views based on
st.session_state.auth_view. This is shown whenever the user is not
yet authenticated.
"""

import streamlit as st
from auth.auth_manager import sign_up, login, forgot_password, AuthError
from utils.config import APP_NAME, APP_TAGLINE


def _switch_view(view: str):
    st.session_state.auth_view = view


def render():
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown(
            f"""
            <div style="text-align:center; padding: 1.5rem 0 0.5rem 0;">
                <div style="
                    width:80px; height:80px; margin:0 auto 1rem auto;
                    border-radius:22px;
                    background: linear-gradient(135deg, #7C3AED 0%, #A855F7 55%, #D946EF 100%);
                    display:flex; align-items:center; justify-content:center;
                    box-shadow: 0 8px 28px rgba(168,85,247,0.45);
                    font-size:2.3rem; font-weight:800; color:white; font-family:'Inter',sans-serif;">
                    Fx
                </div>
                <h1 style="margin-bottom:0.2rem;">{APP_NAME}</h1>
                <p style="color:#9B96B8; font-size:0.95rem;">{APP_TAGLINE}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.write("")

        with st.container(border=True):
            if st.session_state.auth_view == "login":
                _render_login()
            elif st.session_state.auth_view == "signup":
                _render_signup()
            else:
                _render_forgot_password()


def _render_login():
    st.subheader("Log In")
    with st.form("login_form"):
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Log In", use_container_width=True, type="primary")

    if submitted:
        try:
            with st.spinner("Verifying credentials..."):
                user = login(email, password)
            st.session_state.authenticated = True
            st.session_state.user = user
            st.session_state.user_id = user["id"]
            st.session_state.role = user.get("role", "user")
            st.success(f"Welcome back, {user.get('full_name', user['email'])}!")
            st.rerun()
        except AuthError as e:
            st.error(str(e))

    c1, c2 = st.columns(2)
    c1.button("Create an account", on_click=_switch_view, args=("signup",), use_container_width=True)
    c2.button("Forgot password?", on_click=_switch_view, args=("forgot_password",), use_container_width=True)


def _render_signup():
    st.subheader("Create Account")
    with st.form("signup_form"):
        full_name = st.text_input("Full Name")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password",
                                  help="Min 8 characters, with uppercase, lowercase, and a digit.")
        confirm_password = st.text_input("Confirm Password", type="password")
        submitted = st.form_submit_button("Sign Up", use_container_width=True, type="primary")

    if submitted:
        if password != confirm_password:
            st.error("Passwords do not match.")
        else:
            try:
                with st.spinner("Creating your account..."):
                    sign_up(email, password, full_name)
                st.success("Account created! You can now log in.")
                _switch_view("login")
                st.rerun()
            except AuthError as e:
                st.error(str(e))

    st.button("Already have an account? Log in", on_click=_switch_view, args=("login",), use_container_width=True)


def _render_forgot_password():
    st.subheader("Reset Password")
    with st.form("forgot_form"):
        email = st.text_input("Enter your account email")
        submitted = st.form_submit_button("Send Reset", use_container_width=True, type="primary")

    if submitted:
        try:
            with st.spinner("Processing request..."):
                message = forgot_password(email)
            st.success(message)
            st.info("💡 In production this is emailed via SMTP/SES rather than shown on screen.")
        except AuthError as e:
            st.error(str(e))

    st.button("Back to login", on_click=_switch_view, args=("login",), use_container_width=True)
