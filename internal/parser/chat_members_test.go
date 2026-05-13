package parser

import (
	"os"
	"testing"
)

func TestParseListMembersProfiles(t *testing.T) {
	b, err := os.ReadFile("testdata/list_members_with_profiles.txt")
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	profiles, err := ParseListMembersProfiles(string(b))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	want := map[string]MemberProfile{
		"100107566064769605671": {ID: "100107566064769605671", DisplayName: "User One已隱去", Email: "user1@example.test"},
		"105221304721163032917": {ID: "105221304721163032917", DisplayName: "Fake Group", Email: "all@example.test"},
		"115556091904137332172": {ID: "115556091904137332172", DisplayName: "User Two已隱去", Email: "user2@example.test"},
		"113078794454697666226": {ID: "113078794454697666226", DisplayName: "User Three已隱去", Email: "user3@example.test"},
	}
	got := map[string]MemberProfile{}
	for _, p := range profiles {
		got[p.ID] = p
	}
	for id, w := range want {
		g, ok := got[id]
		if !ok {
			t.Errorf("missing profile %s", id)
			continue
		}
		if g.DisplayName != w.DisplayName {
			t.Errorf("%s name: got %q, want %q", id, g.DisplayName, w.DisplayName)
		}
		if g.Email != w.Email {
			t.Errorf("%s email: got %q, want %q", id, g.Email, w.Email)
		}
	}
}

func TestParseListMembersProfiles_IdsOnly(t *testing.T) {
	// The short (ids-only) list_members response has no profile list.
	idsOnly := `)]}'

[["dfe.mem.lm",[[[[["102964339669839252616"]],null,[["AAQAgHTYSKw"]]],"1766470251250970",2,null,4]],null,"",["1776757189535535"]]]`
	profiles, err := ParseListMembersProfiles(idsOnly)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(profiles) != 0 {
		t.Errorf("ids-only response should yield no profiles, got %d", len(profiles))
	}
}

func TestParseListMembersProfiles_Empty(t *testing.T) {
	profiles, err := ParseListMembersProfiles("")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(profiles) != 0 {
		t.Errorf("empty body yielded %d profiles", len(profiles))
	}
}
