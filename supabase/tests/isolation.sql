-- Run ONLY in a disposable Supabase test database with pgTAP available.
-- Test fixtures and assertions roll back. Not executed in this environment.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','owner-a@example.test'),('10000000-0000-4000-8000-000000000002','owner-b@example.test'),('10000000-0000-4000-8000-000000000003','operations@example.test');
insert into restaurants(id,name,slug) values('20000000-0000-4000-8000-000000000001','Test A','isolation-a'),('20000000-0000-4000-8000-000000000002','Test B','isolation-b');
insert into restaurant_members values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner'),('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','operations');
insert into categories(id,restaurant_id,name) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Category A'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Category B');
insert into contacts(restaurant_id,name,phone) values('20000000-0000-4000-8000-000000000001','A','11999990001'),('20000000-0000-4000-8000-000000000002','B','11999990002');
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from contacts),1::bigint,'Owner A sees only own contacts');
select is((select count(*) from contacts where restaurant_id='20000000-0000-4000-8000-000000000002'),0::bigint,'Tenant B contacts are invisible');
select throws_ok($$insert into categories(restaurant_id,name) values('20000000-0000-4000-8000-000000000002','Forbidden')$$,'42501',null,'Cross-tenant insertion rejected');
select throws_ok($$insert into products(restaurant_id,category_id,name,price_cents) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Cross category',1000)$$,'23503',null,'Composite FK rejects cross-tenant category');
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*) from contacts),0::bigint,'Operations cannot read CRM');
select throws_ok($$insert into categories(restaurant_id,name) values('20000000-0000-4000-8000-000000000001','Forbidden')$$,'42501',null,'Operations cannot edit catalog');
reset role;
set local role anon;
select throws_ok('select * from contacts','42501',null,'Anonymous cannot query CRM');
select throws_ok('select * from guest_sessions','42501',null,'Anonymous cannot query session hashes');
reset role;
select * from finish();
rollback;
