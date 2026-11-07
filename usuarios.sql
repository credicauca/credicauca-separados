-- Guarda el correo en el perfil para poder mostrarlo en la lista de usuarios.
alter table perfiles add column if not exists correo text;
update perfiles p set correo = u.email from auth.users u where u.id = p.id and p.correo is null;
