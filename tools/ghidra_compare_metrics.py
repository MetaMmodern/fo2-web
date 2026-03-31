from ghidra.program.model.symbol import SourceType
from ghidra.program.model.listing import CodeUnit


def count_comments(program):
    listing = program.getListing()
    it = listing.getCodeUnits(True)
    total = 0
    by_type = {
        "pre": 0,
        "post": 0,
        "eol": 0,
        "plate": 0,
        "repeatable": 0,
    }
    while it.hasNext() and not monitor.isCancelled():
        cu = it.next()
        has_any = False
        pre = cu.getComment(CodeUnit.PRE_COMMENT)
        if pre:
            by_type["pre"] += 1
            has_any = True
        post = cu.getComment(CodeUnit.POST_COMMENT)
        if post:
            by_type["post"] += 1
            has_any = True
        eol = cu.getComment(CodeUnit.EOL_COMMENT)
        if eol:
            by_type["eol"] += 1
            has_any = True
        plate = cu.getComment(CodeUnit.PLATE_COMMENT)
        if plate:
            by_type["plate"] += 1
            has_any = True
        repeatable = cu.getComment(CodeUnit.REPEATABLE_COMMENT)
        if repeatable:
            by_type["repeatable"] += 1
            has_any = True
        if has_any:
            total += 1
    return total, by_type


def main():
    program = currentProgram
    fm = program.getFunctionManager()
    st = program.getSymbolTable()

    all_symbol_count = 0
    user_defined_symbol_count = 0
    imported_symbol_count = 0
    analysis_symbol_count = 0
    default_symbol_count = 0

    user_defined_function_count = 0
    sample_user_functions = []

    sym_it = st.getAllSymbols(True)
    while sym_it.hasNext() and not monitor.isCancelled():
        sym = sym_it.next()
        all_symbol_count += 1
        source = sym.getSource()
        if source == SourceType.USER_DEFINED:
            user_defined_symbol_count += 1
        elif source == SourceType.IMPORTED:
            imported_symbol_count += 1
        elif source == SourceType.ANALYSIS:
            analysis_symbol_count += 1
        elif source == SourceType.DEFAULT:
            default_symbol_count += 1

    fn_it = fm.getFunctions(True)
    function_count = 0
    while fn_it.hasNext() and not monitor.isCancelled():
        fn = fn_it.next()
        function_count += 1
        if fn.getSymbol().getSource() == SourceType.USER_DEFINED:
            user_defined_function_count += 1
            if len(sample_user_functions) < 40:
                sample_user_functions.append(
                    "%s @ %s" % (fn.getName(), fn.getEntryPoint())
                )

    info = program.getOptions("Program Information")
    info_names = list(info.getOptionNames())
    interesting_info = {}
    for key in sorted(info_names):
        if key in [
            "Executable Format",
            "Executable Location",
            "Executable MD5",
            "Executable SHA256",
            "Compiler",
            "Compiler ID",
            "Language ID",
            "PE Property[TimeDateStamp]",
            "PE Property[OriginalFilename]",
            "PE Property[FileVersion]",
            "PE Property[ProductVersion]",
            "Created With Ghidra Version",
        ]:
            interesting_info[key] = info.getValueAsString(key)

    total_comment_units, comment_breakdown = count_comments(program)

    print("PROGRAM_NAME=%s" % program.getName())
    print("IMAGE_BASE=%s" % program.getImageBase())
    for key in sorted(interesting_info.keys()):
        print("INFO_%s=%s" % (key.replace(" ", "_"), interesting_info[key]))
    print("FUNCTION_COUNT=%d" % function_count)
    print("USER_DEFINED_FUNCTION_COUNT=%d" % user_defined_function_count)
    print("SYMBOL_COUNT=%d" % all_symbol_count)
    print("USER_DEFINED_SYMBOL_COUNT=%d" % user_defined_symbol_count)
    print("IMPORTED_SYMBOL_COUNT=%d" % imported_symbol_count)
    print("ANALYSIS_SYMBOL_COUNT=%d" % analysis_symbol_count)
    print("DEFAULT_SYMBOL_COUNT=%d" % default_symbol_count)
    print("COMMENT_UNITS=%d" % total_comment_units)
    for key in ["plate", "pre", "eol", "repeatable", "post"]:
        print("COMMENT_%s=%d" % (key.upper(), comment_breakdown[key]))
    for sample in sample_user_functions:
        print("USER_FUNCTION=%s" % sample)


main()
