const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let currentUser = null;
let activeProfileUsername = null;
let toastTimer;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initials = name => (String(name || '?').trim().split(/\s+/).slice(0,2).map(p => p[0]).join('') || '?').toUpperCase();
function avatarMarkup(name, url, extra = '') { return `<div class="avatar ${extra}">${url ? `<img src="${escapeHTML(url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : escapeHTML(initials(name))}</div>`; }
function toast(message, isError = false) {
  const el = $('#toast'); el.textContent = message; el.classList.toggle('error', isError); el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function showAuth(tab = 'login') {
  $('#auth-view').classList.remove('hidden'); $('#app-view').classList.add('hidden');
  $$('.tab').forEach(button => button.classList.toggle('active', button.dataset.authTab === tab));
  $('#login-form').classList.toggle('hidden', tab !== 'login'); $('#register-form').classList.toggle('hidden', tab !== 'register');
}
function showApp() {
  $('#auth-view').classList.add('hidden'); $('#app-view').classList.remove('hidden');
  $('#top-avatar').innerHTML = currentUser.avatarUrl ? `<img src="${escapeHTML(currentUser.avatarUrl)}" alt="">` : escapeHTML(initials(currentUser.displayName));
  $('#composer-avatar').innerHTML = currentUser.avatarUrl ? `<img src="${escapeHTML(currentUser.avatarUrl)}" alt="">` : escapeHTML(initials(currentUser.displayName));
  $('#top-name').textContent = currentUser.displayName;
  switchView(location.hash.replace('#','') || 'feed');
}
function switchView(view) {
  if (!['feed','discover','profile'].includes(view)) view = 'feed';
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $$('.view-section').forEach(section => section.classList.toggle('hidden', section.id !== `${view}-section`));
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  if (view === 'feed') loadFeed();
  if (view === 'discover') { $('#search-results').innerHTML = '<div class="empty-state">Search for a name or username to get started.</div>'; }
  if (view === 'profile') loadProfile(currentUser.username);
}
function postMarkup(post) {
  const comments = post.comments.map(comment => `<div class="comment"><span>${avatarMarkup(comment.user.displayName, '', 'avatar-small').replace('class="avatar avatar-small"','class="avatar avatar-small" style="width:24px;height:24px;border-radius:8px;font-size:9px"')} </span><div><strong>${escapeHTML(comment.user.displayName)}</strong><span>${escapeHTML(comment.content)}</span></div></div>`).join('');
  return `<article class="post-card" data-post-id="${post.id}">
    <div class="post-header">${avatarMarkup(post.author.displayName, post.author.avatarUrl)}<div class="post-author"><button class="author-link" data-open-profile="${escapeHTML(post.author.username)}">${escapeHTML(post.author.displayName)}</button><div class="post-handle">@${escapeHTML(post.author.username)}</div></div><span class="post-date">${escapeHTML(new Date(`${post.createdAt.replace(' ','T')}Z`).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</span></div>
    <div class="post-content">${escapeHTML(post.content)}</div>
    <div class="post-actions"><button class="action-btn ${post.likedByMe?'liked':''}" data-like="${post.id}">${post.likedByMe?'♥':'♡'} <span class="like-count">${post.likeCount}</span> ${post.likeCount===1?'like':'likes'}</button><button class="action-btn" data-toggle-comments="${post.id}">▤ ${post.commentCount} ${post.commentCount===1?'comment':'comments'}</button></div>
    <div class="comments ${post.commentCount?'':'hidden'}" id="comments-${post.id}">${comments}<form class="comment-form" data-comment-form="${post.id}"><input name="content" maxlength="1000" required placeholder="Add to the conversation…"><button type="submit">Reply ↗</button></form></div>
  </article>`;
}
async function loadFeed() {
  const root = $('#feed-list'); root.innerHTML = '<div class="loading-state">Loading your community<span class="loading-dots">•••</span></div>';
  try { const data = await api('/api/feed'); root.innerHTML = data.posts.length ? data.posts.map(postMarkup).join('') : `<div class="empty-state">Your feed is ready for its first conversation.<br>Be the first to share a thought above.</div>`; }
  catch (e) { root.innerHTML = `<div class="empty-state">${escapeHTML(e.message)}<br><button class="btn btn-primary" id="retry-feed">Try again</button></div>`; }
}
function personMarkup(user) {
  return `<article class="person-card"><div class="person-top">${avatarMarkup(user.displayName,user.avatarUrl)}<div><h3><button class="author-link" data-open-profile="${escapeHTML(user.username)}">${escapeHTML(user.displayName)}</button></h3><div class="handle">@${escapeHTML(user.username)}</div></div></div><p class="bio">${escapeHTML(user.bio || 'Still finding the right words for their bio.')}</p><div class="person-stats">${user.followersCount} ${user.followersCount===1?'follower':'followers'}</div><button class="btn btn-follow ${user.followedByMe?'following':''}" data-follow="${user.id}">${user.followedByMe?'✓ Following':'＋ Follow'}</button></article>`;
}
async function searchPeople(query) {
  const root = $('#search-results'); root.innerHTML = '<div class="loading-state">Finding people…</div>';
  try { const data = await api(`/api/users/search?q=${encodeURIComponent(query)}`); root.innerHTML = data.users.length ? data.users.map(personMarkup).join('') : '<div class="empty-state">No people matched that search. Try another name.</div>'; }
  catch (e) { root.innerHTML = `<div class="empty-state">${escapeHTML(e.message)}</div>`; }
}
function profileMarkup(profile) {
  const followButton = profile.isMe ? '' : `<button class="btn btn-follow ${profile.followedByMe?'following':''}" data-follow="${profile.id}">${profile.followedByMe?'✓ Following':'＋ Follow'}</button>`;
  const editForm = profile.isMe ? `<form id="edit-profile-form" class="edit-profile"><h3>Make it yours</h3><div class="edit-grid"><label>Display name<input name="displayName" maxlength="40" required value="${escapeHTML(profile.displayName)}"></label><label>Avatar image URL <span class="muted">(optional)</span><input name="avatarUrl" type="url" value="${escapeHTML(profile.avatarUrl||'')}" placeholder="https://…"></label><label class="full-width">A little about you<textarea name="bio" maxlength="280" placeholder="What would you like people to know?">${escapeHTML(profile.bio||'')}</textarea></label></div><div class="profile-actions"><button class="btn btn-primary" type="submit">Save profile ↗</button><span class="muted tiny">Bio up to 280 characters</span></div></form>` : '';
  return `<div class="profile-hero">${avatarMarkup(profile.displayName,profile.avatarUrl)}<div class="profile-details"><h2>${escapeHTML(profile.displayName)}</h2><div class="handle">@${escapeHTML(profile.username)}</div><p class="profile-bio">${escapeHTML(profile.bio || (profile.isMe ? 'Add a short bio so people can get to know you.' : 'This person has not added a bio yet.'))}</p>${followButton}</div></div><div class="stats-row"><div class="stat"><strong>${profile.postsCount}</strong><span>Posts</span></div><div class="stat"><strong>${profile.followersCount}</strong><span>Followers</span></div><div class="stat"><strong>${profile.followingCount}</strong><span>Following</span></div></div>${editForm}`;
}
async function loadProfile(username) {
  activeProfileUsername = username;
  $('#profile-card').innerHTML = '<div class="loading-state">Loading profile…</div>'; $('#profile-posts').innerHTML = '';
  try {
    const data = await api(`/api/users/${encodeURIComponent(username)}`);
    $('#profile-card').innerHTML = profileMarkup(data.profile);
    $('#profile-posts').innerHTML = data.posts.length ? data.posts.map(postMarkup).join('') : '<div class="empty-state">No posts here yet.</div>';
  } catch (e) { $('#profile-card').innerHTML = `<div class="empty-state">${escapeHTML(e.message)}</div>`; }
}
function openProfile(username) {
  if (username === currentUser.username) { switchView('profile'); return; }
  // Keep the profile view accessible without adding a fourth navigation item.
  $$('.nav-item').forEach(button => button.classList.remove('active'));
  $$('.view-section').forEach(section => section.classList.toggle('hidden', section.id !== 'profile-section'));
  if (location.hash !== '#profile') history.replaceState(null, '', '#profile');
  $('#profile-section .page-heading h1').innerHTML = 'Community profile<span class="period">.</span>';
  loadProfile(username);
}

$$('.tab').forEach(button => button.addEventListener('click', () => showAuth(button.dataset.authTab)));
$$('.nav-item').forEach(button => button.addEventListener('click', () => {
  $('#profile-section .page-heading h1').innerHTML = 'Profile<span class="period">.</span>';
  switchView(button.dataset.view);
}));
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); button.disabled = true;
  try { const data = await api('/api/auth/login', { method:'POST', body:JSON.stringify(formData(event.currentTarget)) }); currentUser = data.user; showApp(); toast(`Welcome back, ${currentUser.displayName}.`); }
  catch(e) { toast(e.message,true); } finally { button.disabled = false; }
});
$('#register-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); button.disabled = true;
  try { const data = await api('/api/auth/register', { method:'POST', body:JSON.stringify(formData(event.currentTarget)) }); currentUser = data.user; showApp(); toast('Your account is ready. Welcome to Gather!'); }
  catch(e) { toast(e.message,true); } finally { button.disabled = false; }
});
$('#logout-button').addEventListener('click', async () => { try { await api('/api/auth/logout',{method:'POST'}); } finally { currentUser=null; showAuth('login'); toast('You have signed out.'); } });
$('#post-form').addEventListener('submit', async event => {
  event.preventDefault(); const textarea = $('textarea',event.currentTarget); const button = $('button[type="submit"]',event.currentTarget); button.disabled=true;
  try { await api('/api/posts',{method:'POST',body:JSON.stringify({content:textarea.value})}); textarea.value=''; await loadFeed(); toast('Your post is live.'); }
  catch(e){toast(e.message,true)} finally{button.disabled=false}
});
$('#refresh-feed').addEventListener('click',loadFeed);
$('#search-form').addEventListener('submit',event=>{event.preventDefault();const q=new FormData(event.currentTarget).get('q').trim();if(q)searchPeople(q)});
document.addEventListener('click', async event => {
  const profileButton=event.target.closest('[data-open-profile]');
  if(profileButton){openProfile(profileButton.dataset.openProfile);return}
  const followButton=event.target.closest('[data-follow]');
  if(followButton){followButton.disabled=true;try{const data=await api(`/api/users/${followButton.dataset.follow}/follow`,{method:'POST'});toast(data.following?'You are now following this person.':'You unfollowed this person.');if($('#discover-section').classList.contains('hidden')===false){const q=$('#search-form input').value.trim();if(q)await searchPeople(q)}if(activeProfileUsername && activeProfileUsername!==currentUser.username && !$('#profile-section').classList.contains('hidden'))await loadProfile(activeProfileUsername);}
    catch(e){toast(e.message,true)}finally{followButton.disabled=false}return}
  const likeButton=event.target.closest('[data-like]');
  if(likeButton){try{const data=await api(`/api/posts/${likeButton.dataset.like}/like`,{method:'POST'});likeButton.classList.toggle('liked',data.liked);likeButton.innerHTML=`${data.liked?'♥':'♡'} <span class="like-count">${data.likeCount}</span> ${data.likeCount===1?'like':'likes'}`;}catch(e){toast(e.message,true)}return}
  const commentsButton=event.target.closest('[data-toggle-comments]');
  if(commentsButton){const target=$(`#comments-${commentsButton.dataset.toggleComments}`);target.classList.toggle('hidden');if(!target.querySelector('input'))target.innerHTML+='<form class="comment-form" data-comment-form="'+commentsButton.dataset.toggleComments+'"><input name="content" maxlength="1000" required placeholder="Add to the conversation…"><button type="submit">Reply ↗</button></form>';return}
  if(event.target.id==='retry-feed')loadFeed();
});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-comment-form]');if(form){event.preventDefault();const input=$('input[name="content"]',form);const button=$('button',form);button.disabled=true;try{await api(`/api/posts/${form.dataset.commentForm}/comments`,{method:'POST',body:JSON.stringify({content:input.value})});await loadFeed();if(activeProfileUsername && !$('#profile-section').classList.contains('hidden'))await loadProfile(activeProfileUsername);toast('Comment added.')}catch(e){toast(e.message,true)}finally{button.disabled=false}return}
  if(event.target.id==='edit-profile-form'){event.preventDefault();const button=$('button[type="submit"]',event.target);button.disabled=true;try{const data=await api('/api/profile',{method:'PUT',body:JSON.stringify(formData(event.target))});currentUser=data.user;$('#top-name').textContent=currentUser.displayName;$('#top-avatar').innerHTML=currentUser.avatarUrl?`<img src="${escapeHTML(currentUser.avatarUrl)}" alt="">`:escapeHTML(initials(currentUser.displayName));$('#composer-avatar').innerHTML=currentUser.avatarUrl?`<img src="${escapeHTML(currentUser.avatarUrl)}" alt="">`:escapeHTML(initials(currentUser.displayName));await loadProfile(currentUser.username);toast('Profile updated.')}catch(e){toast(e.message,true)}finally{button.disabled=false}}
});
(async function init(){try{const data=await api('/api/me');currentUser=data.user;showApp()}catch{showAuth('login')}})();
