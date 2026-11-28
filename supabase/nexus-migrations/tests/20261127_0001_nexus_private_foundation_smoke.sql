do $$
declare n integer; r integer; p integer;
begin
 select count(*) into n from information_schema.tables where table_schema='nexus' and table_type='BASE TABLE';
 if n<>10 then raise exception 'expected 10 nexus tables, got %',n; end if;
 select count(*) into r from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='nexus' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);
 if r<>0 then raise exception 'RLS missing on % table(s)',r; end if;
 select count(*) into p from pg_policies where schemaname='nexus';
 if p<>0 then raise exception 'default-deny expected, found % policies',p; end if;
 if has_schema_privilege('anon','nexus','USAGE') or has_schema_privilege('authenticated','nexus','USAGE') then raise exception 'public roles must not use nexus schema'; end if;
 if has_table_privilege('anon','nexus.conversations','SELECT') or has_table_privilege('authenticated','nexus.messages','INSERT') then raise exception 'public roles unexpectedly have table grants'; end if;
end $$;
