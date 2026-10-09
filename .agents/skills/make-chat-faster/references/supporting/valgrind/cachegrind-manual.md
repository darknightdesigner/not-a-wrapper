# Cachegrind: a high-precision tracing profiler

- Original: [Cachegrind: a high-precision tracing profiler](https://valgrind.org/docs/manual/cg-manual.html)
- Attribution: Valgrind developers
- Retrieved: 2026-10-09
- Copy: Full article or chapter body converted to Markdown. Site navigation excluded; links made absolute. The full original HTML is stored beside this file as a gzip archive.
- License: GFDL-1.2-or-later

Copyright 2000-2026 Valgrind AUTHORS. [GFDL 1.2 or later](license-gfdl.md); no invariant sections or cover texts. See the [original documentation title page](documentation-title-page.html.gz).

---

# 5. Cachegrind: a high-precision tracing profiler

**Table of Contents**

[5.1. Overview](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.overview)

[5.2. Using Cachegrind and cg_annotate](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.profile)
:   [5.2.1. Running Cachegrind](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.running-cachegrind)

    [5.2.2. Output File](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.outputfile)

    [5.2.3. Running cg_annotate](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.running-cg_annotate)

    [5.2.4. The Metadata Section](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.the-metadata)

    [5.2.5. Global, File, and Function-level Counts](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.the-global)

    [5.2.6. Per-line Counts](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.line-by-line)

    [5.2.7. Forking Programs](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.forkingprograms)

    [5.2.8. cg_annotate Warnings](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.annopts.warnings)

    [5.2.9. Merging Cachegrind Output Files](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.cg_merge)

    [5.2.10. Differencing Cachegrind output files](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.cg_diff)

    [5.2.11. Cache and Branch Simulation](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.cache-branch-sim)

[5.3. Cachegrind Command-line Options](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.cgopts)

[5.4. cg_annotate Command-line Options](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.annopts)

[5.5. cg_merge Command-line Options](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.mergeopts)

[5.6. cg_diff Command-line Options](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.diffopts)

[5.7. Cachegrind Client Requests](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.clientrequests)

[5.8. Simulation Details](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.sim-details)
:   [5.8.1. Cache Simulation Specifics](https://valgrind.org/docs/manual/cg-manual.html#cache-sim)

    [5.8.2. Branch Simulation Specifics](https://valgrind.org/docs/manual/cg-manual.html#branch-sim)

    [5.8.3. Accuracy](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.annopts.accuracy)

[5.9. Implementation Details](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.impl-details)
:   [5.9.1. How Cachegrind Works](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.impl-details.how-cg-works)

    [5.9.2. Cachegrind Output File Format](https://valgrind.org/docs/manual/cg-manual.html#cg-manual.impl-details.file-format)

To use this tool, specify `--tool=cachegrind` on the Valgrind
command line.

## 5.1. Overview

Cachegrind is a high-precision tracing profiler. It runs slowly, but collects
precise and reproducible profiling data. It can merge and diff data from
different runs. To expand on these characteristics:

- *Precise.* Cachegrind measures the exact number of
  instructions executed by your program, not an approximation. Furthermore,
  it presents the gathered data at the file, function, and line level. This
  is different to many other profilers that measure approximate execution
  time, using sampling, and only at the function level.
- *Reproducible.* In general, execution time is a better
  metric than instruction counts because it's what users perceive. However,
  execution time often has high variability. When running the exact same
  program on the exact same input multiple times, execution time might vary
  by several percent. Furthermore, small changes in a program can change its
  memory layout and have even larger effects on runtime. In contrast,
  instruction counts are highly reproducible; for some programs they are
  perfectly reproducible. This means the effects of small changes in a
  program can be measured with high precision.

For these reasons, Cachegrind is an excellent complement to time-based profilers.

Cachegrind can annotate programs written in any language, so long as debug info
is present to map machine code back to the original source code. Cachegrind has
been used successfully on programs written in C, C++, Rust, and assembly.

Cachegrind can also simulate how your program interacts with a machine's cache
hierarchy and branch predictor. This simulation was the original motivation for
the tool, hence its name. However, the simulations are basic and unlikely to
reflect the behaviour of a modern machine. For this reason they are off by
default. If you really want cache and branch information, a profiler like
`perf` that accesses hardware counters is a
better choice.

## 5.2. Using Cachegrind and cg_annotate

First, as for normal Valgrind use, you should compile with debugging info (the
`-g` option in most compilers). But by contrast with normal
Valgrind use, you probably do want to turn optimisation on, since you should
profile your program as it will be normally run.

Second, run Cachegrind itself to gather the profiling data.

Third, run cg_annotate to get a detailed presentation of that data. cg_annotate
can combine the results of multiple Cachegrind output files. It can also
perform a diff between two Cachegrind output files.

### 5.2.1. Running Cachegrind

To run Cachegrind on a program `prog`, run:

```
valgrind --tool=cachegrind prog
```

The program will execute (slowly). Upon completion, summary statistics that
look like this will be printed:

```
==17942== I refs:          8,195,070
```

The `I refs` number is short for "Instruction
cache references", which is equivalent to "instructions executed". If you
enable the cache and/or branch simulation, additional counts will be shown.

### 5.2.2. Output File

Cachegrind also writes more detailed profiling data to a file. By default this
Cachegrind output file is named `cachegrind.out.<pid>`
(where `<pid>` is the program's process ID), but its
name can be changed with the `--cachegrind-out-file` option.
This file is human-readable, but is intended to be interpreted by the
accompanying program cg_annotate, described in the next section.

The default `.<pid>` suffix on the output
file name serves two purposes. First, it means existing Cachegrind output files
aren't immediately overwritten. Second, and more importantly, it allows correct
profiling with the `--trace-children=yes` option of programs
that spawn child processes.

### 5.2.3. Running cg_annotate

Before using cg_annotate, it is worth widening your window to be at least 120
characters wide if possible, because the output lines can be quite long.

Then run:

```
cg_annotate <filename>
```

on a Cachegrind output file.

### 5.2.4. The Metadata Section

The first part of the output looks like this:

```
--------------------------------------------------------------------------------
-- Metadata
--------------------------------------------------------------------------------
Invocation:       ../cg_annotate concord.cgout
Command:          ./concord ../cg_main.c
Events recorded:  Ir
Events shown:     Ir
Event sort order: Ir
Threshold:        0.1%
Annotation:       on
```

It summarizes how Cachegrind and the profiled program were run.

- Invocation: the command line used to produce this output.
- Command: the command line used to run the profiled program.
- Events recorded: which events were recorded. By default, this is
  `Ir`. More events will be recorded if cache
  and/or branch simulation is enabled.
- Events shown: the events shown, which is a subset of the events gathered.
  This can be adjusted with the `--show` option.
- Event sort order: the sort order used for the subsequent sections. For
  example, in this case those sections are sorted from highest
  `Ir` counts to lowest. If there are multiple
  events, one will be the primary sort event, and then there can be a
  secondary sort event, tertiary sort event, etc., though more than one is
  rarely needed. This order can be adjusted with the `--sort`
  option. Note that this does *not* specify the order in
  which the columns appear. That is specified by the "events shown" line (and
  can be changed with the `--show` option).
- Threshold: cg_annotate by default omits files and functions with very low
  counts to keep the output size reasonable. By default cg_annotate only
  shows files and functions that account for at least 0.1% of the primary
  sort event. The threshold can be adjusted with the
  `--threshold` option.
- Annotation: whether source file annotation is enabled. Controlled with the
  `--annotate` option.

If cache simulation is enabled, details of the cache parameters will be shown
above the "Invocation" line.

### 5.2.5. Global, File, and Function-level Counts

Next comes the summary for the whole program:

```
--------------------------------------------------------------------------------
-- Summary
--------------------------------------------------------------------------------
Ir________________

8,195,070 (100.0%)  PROGRAM TOTALS
```

The `Ir` column label is suffixed with
underscores to show the bounds of the columns underneath.

Then comes file:function counts. Here is the first part of that section:

```
--------------------------------------------------------------------------------
-- File:function summary
--------------------------------------------------------------------------------
  Ir______________________  file:function

< 3,078,746 (37.6%, 37.6%)  /home/njn/grind/ws1/cachegrind/concord.c:
  1,630,232 (19.9%)           get_word
    630,918  (7.7%)           hash
    461,095  (5.6%)           insert
    130,560  (1.6%)           add_existing
     91,014  (1.1%)           init_hash_table
     88,056  (1.1%)           create
     46,676  (0.6%)           new_word_node

< 1,746,038 (21.3%, 58.9%)  ./malloc/./malloc/malloc.c:
  1,285,938 (15.7%)           _int_malloc
    458,225  (5.6%)           malloc

< 1,107,550 (13.5%, 72.4%)  ./libio/./libio/getc.c:getc

<   551,071  (6.7%, 79.1%)  ./string/../sysdeps/x86_64/multiarch/strcmp-avx2.S:__strcmp_avx2

<   521,228  (6.4%, 85.5%)  ./ctype/../include/ctype.h:
    260,616  (3.2%)           __ctype_tolower_loc
    260,612  (3.2%)           __ctype_b_loc

<   468,163  (5.7%, 91.2%)  ???:
    468,151  (5.7%)           ???

<   456,071  (5.6%, 96.8%)  /usr/include/ctype.h:get_word
```

Each entry covers one file, and one or more functions within that file. If
there is only one significant function within a file, as in the first entry,
the file and function are shown on the same line separate by a colon. If there
are multiple significant functions within a file, as in the third entry, each
function gets its own line.

This example involves a small C program, and shows a combination of code from
the program itself (including functions like `get_word` and
`hash` in the file `concord.c`) as well
as code from system libraries, such as functions like
`malloc` and `getc`.

Each entry is preceded with a `<`, which can
be useful when navigating through the output in an editor, or grepping through
results.

The first percentage in each column indicates the proportion of the total event
count is covered by this line. The second percentage, which only shows on the
first line of each entry, shows the cumulative percentage of all the entries up
to and including this one. The entries shown here account for 96.8% of the
instructions executed by the program.

The name `???` is used if the file name and/or
function name could not be determined from debugging information. If
`???` filenames dominate, the program probably wasn't
compiled with `-g`. If `???` function names
dominate, the program may have had symbols stripped.

After that comes function:file counts. Here is the first part of that section:

```
--------------------------------------------------------------------------------
-- Function:file summary
--------------------------------------------------------------------------------
  Ir______________________  function:file

> 2,086,303 (25.5%, 25.5%)  get_word:
  1,630,232 (19.9%)           /home/njn/grind/ws1/cachegrind/concord.c
    456,071  (5.6%)           /usr/include/ctype.h

> 1,285,938 (15.7%, 41.1%)  _int_malloc:./malloc/./malloc/malloc.c

> 1,107,550 (13.5%, 54.7%)  getc:./libio/./libio/getc.c

>   630,918  (7.7%, 62.4%)  hash:/home/njn/grind/ws1/cachegrind/concord.c

>   551,071  (6.7%, 69.1%)  __strcmp_avx2:./string/../sysdeps/x86_64/multiarch/strcmp-avx2.S

>   480,248  (5.9%, 74.9%)  malloc:
    458,225  (5.6%)           ./malloc/./malloc/malloc.c
     22,023  (0.3%)           ./malloc/./malloc/arena.c

>   468,151  (5.7%, 80.7%)  ???:???

>   461,095  (5.6%, 86.3%)  insert:/home/njn/grind/ws1/cachegrind/concord.c
```

This is similar to the previous section, but is grouped by functions first and
files second. Also, the entry markers are `>`
instead of `<`.

You might wonder why this section is needed, and how it differs from the
previous section. The answer is inlining. In this example there are two entries
demonstrating a function whose code is effectively spread across more than one
file: `get_word` and `malloc`. Here is an
example from profiling the Rust compiler, a much larger program that uses
inlining more:

```
>  30,469,230 (1.3%, 11.1%)  <rustc_middle::ty::context::CtxtInterners>::intern_ty:
   10,269,220 (0.5%)           /home/njn/.cargo/registry/src/github.com-1ecc6299db9ec823/hashbrown-0.12.3/src/raw/mod.rs
    7,696,827 (0.3%)           /home/njn/dev/rust0/compiler/rustc_middle/src/ty/context.rs
    3,858,099 (0.2%)           /home/njn/dev/rust0/library/core/src/cell.rs
```

In this case the compiled function `intern_ty` includes code
from three different source files, due to inlining. These should be examined
together. Older versions of cg_annotate presented this entry as three separate
file:function entries, which would typically be intermixed with all the other
entries, making it hard to see that they are all really part of the same
function.

### 5.2.6. Per-line Counts

By default, a source file is annotated if it contains at least one function
that meets the significance threshold. This can be disabled with the
`--annotate` option.

To continue the previous example, here is part of the annotation of the file
`concord.c`:

```
--------------------------------------------------------------------------------
-- Annotated source file: /home/njn/grind/ws1/cachegrind/docs/concord.c
--------------------------------------------------------------------------------
Ir____________

      .         /* Function builds the hash table from the given file. */\
      .         void init_hash_table(char *file_name, Word_Node *table[])\
      8 (0.0%)  {\
      .             FILE *file_ptr;\
      .             Word_Info *data;\
      2 (0.0%)      int line = 1, i;\
      .\
      .             /* Structure used when reading in words and line numbers. */
      3 (0.0%)      data = (Word_Info *) create(sizeof(Word_Info));\
      .\
      .             /* Initialise entire table to NULL. */\
  2,993 (0.0%)      for (i = 0; i < TABLE_SIZE; i++)\
    997 (0.0%)          table[i] = NULL;\
      .\
      .             /* Open file, check it. */\
      4 (0.0%)      file_ptr = fopen(file_name, "r");\
      2 (0.0%)      if (!(file_ptr)) {\
      .                 fprintf(stderr, "Couldn't open '%s'.\n", file_name);
      .                 exit(EXIT_FAILURE);\
      .             }\
      .\
      .             /*  'Get' the words and lines one at a time from the file, and insert them
      .             ** into the table one at a time. */\
 55,363 (0.7%)      while ((line = get_word(data, line, file_ptr)) != EOF)
 31,632 (0.4%)          insert(data->word, data->line, table);\
      .\
      2 (0.0%)      free(data);\
      2 (0.0%)      fclose(file_ptr);\
      6 (0.0%)  }
```

Each executed line is annotated with its event counts. Other lines are
annotated with a dot. This may be because they contain no executable code, or
they contain executable code but were never executed.

You can easily tell if a function is inlined from this output. If it is not
inlined, it will have event counts on the lines containing the opening and
closing braces. If it is inlined, it will not have event counts on those lines.
In the example above, `init_hash_table` does have counts,
so you can tell it is not inlined.

Note again that inlining can lead to surprising results. If a function
`f` is always inlined, in the file:function and
function:file sections counts will be attributed to the functions it is inlined
into, rather than itself. However, if you look at the line-by-line annotations
for `f` you'll see the counts that belong to
`f`. So it's worth looking for large counts/percentages in the
line-by-line annotations.

Sometimes only a small section of a source file is executed. To minimise
uninteresting output, Cachegrind only shows annotated lines and lines within a
small distance of annotated lines. Gaps are marked with line numbers, for
example:

```
(counts and code for line 704)
-- line 375 ----------------------------------------
-- line 514 ----------------------------------------
(counts and code for line 878)
```

The number of lines of context shown around annotated lines is controlled by
the `--context` option.

Any significant source files that could not be found are shown like this:

```
--------------------------------------------------------------------------------
-- Annotated source file: ./malloc/./malloc/malloc.c\
--------------------------------------------------------------------------------
Unannotated because one or more of these original files are unreadable:\
- ./malloc/./malloc/malloc.c
```

This is common for library files, because libraries are usually compiled with
debugging information but the source files are rarely present on a system.

Cachegrind relies heavily on accurate debug info. Sometimes compilers do not
map a particular compiled instruction to line number 0, where the 0 represents
"unknown" or "none". This is annoying but does happen in practice. cg_annotate
prints these in the following way:

```
--------------------------------------------------------------------------------
-- Annotated source file: /home/njn/dev/rust0/compiler/rustc_borrowck/src/lib.rs
--------------------------------------------------------------------------------
Ir______________

1,046,746 (0.0%)  <unknown (line 0)>
```

Finally, when annotation is performed, the output ends with a summary of how
many counts were annotated and unannotated, and why. For example:

```
--------------------------------------------------------------------------------
-- Annotation summary
--------------------------------------------------------------------------------
Ir_______________

3,534,817 (43.1%)    annotated: files known & above threshold & readable, line numbers known
        0            annotated: files known & above threshold & readable, line numbers unknown
        0          unannotated: files known & above threshold & two or more non-identical
4,132,126 (50.4%)  unannotated: files known & above threshold & unreadable
   59,950  (0.7%)  unannotated: files known & below threshold
  468,163  (5.7%)  unannotated: files unknown
```

### 5.2.7. Forking Programs

If your program forks, the child will inherit all the profiling data that
has been gathered for the parent.

If the output file name (controlled by `--cachegrind-out-file`)
does not contain `%p`, then the outputs from the parent and
child will be intermingled in a single output file, which will almost certainly
make it unreadable by cg_annotate.

### 5.2.8. cg_annotate Warnings

There are two situations in which cg_annotate prints warnings.

- If a source file is more recent than the Cachegrind output file. This is
  because the information in the Cachegrind output file is only recorded with
  line numbers, so if the line numbers change at all in the source (e.g.
  lines added, deleted, swapped), any annotations will be incorrect.
- If information is recorded about line numbers past the end of a file. This
  can be caused by the above problem, e.g. shortening the source file while
  using an old Cachegrind output file. If this happens, the figures for the
  bogus lines are printed anyway (and clearly marked as bogus) in case they
  are important.

### 5.2.9. Merging Cachegrind Output Files

cg_annotate can merge data from multiple Cachegrind output files in a single
run. (There is also a program called cg_merge that can merge multiple
Cachegrind output files into a single Cachegrind output file, but it is now
deprecated because cg_annotate's merging does a better job.)

Use it as follows:

```
cg_annotate file1 file2 file3 ...
```

cg_annotate computes the sum of these files (effectively
`file1` + `file2` +
`file3`), and then produces output as usual that shows the
summed counts.

The most common merging scenario is if you want to aggregate costs over
multiple runs of the same program, possibly on different inputs.

### 5.2.10. Differencing Cachegrind output files

cg_annotate can diff data from two Cachegrind output files in a single run.
(There is also a program called cg_diff that can diff two Cachegrind output
files into a single Cachegrind output file, but it is now deprecated because
cg_annotate's differencing does a better job.)

Use it as follows:

```
cg_annotate --diff file1 file2
```

cg_annotate computes the difference between these two files (effectively
`file2` - `file1`), and then
produces output as usual that shows the count differences. Note that many of
the counts may be negative; this indicates that the counts for the relevant
file/function/line are smaller in the second version than those in the first
version.

The simplest common scenario is comparing two Cachegrind output files that came
from the same program, but on different inputs. cg_annotate will do a good job
on this without assistance.

A more complex scenario is if you want to compare Cachegrind output files from
two slightly different versions of a program that you have sitting
side-by-side, running on the same input. For example, you might have
`version1/prog.c` and `version2/prog.c`.
A straight comparison of the two would not be useful. Because functions are
always paired with filenames, a function `f` would be listed
as `version1/prog.c:f` for the first version but
`version2/prog.c:f` for the second version.

In this case, use the `--mod-filename` option. Its argument is a
search-and-replace expression that will be applied to all the filenames in both
Cachegrind output files. It can be used to remove minor differences in
filenames. For example, the option
`--mod-filename='s/version[0-9]/versionN/'` will suffice for the
above example.

Similarly, sometimes compilers auto-generate certain functions and give them
randomized names like `T.1234` where the suffixes vary from
build to build. You can use the `--mod-funcname` option to
remove small differences like these; it works in the same way as
`--mod-filename`.

When `--mod-filename` is used to compare two different versions
of the same program, cg_annotate will not annotate any file that is different
between the two versions, because the per-line counts are not reliable in such
a case. For example, imagine if `version2/prog.c` is the
same as `version1/prog.c` except with an extra blank line at
the top of the file. Every single per-line count will have changed. In
comparison, the per-file and per-function counts have not changed, and are
still very useful for determining differences between programs. You might think
that this means every interesting file will be left unannotated, but again
inlining means that files that are identical in the two versions can have
different counts on many lines.

### 5.2.11. Cache and Branch Simulation

Cachegrind can simulate how your program interacts with a machine's cache
hierarchy and/or branch predictor.
The cache simulation models a machine with independent first-level instruction
and data caches (I1 and D1), backed by a unified second-level cache (L2). For
these machines (in the cases where Cachegrind can auto-detect the cache
configuration) Cachegrind simulates the first-level and last-level caches.
Therefore, Cachegrind always refers to the I1, D1 and LL (last-level) caches.

When simulating the cache, with `--cache-sim=yes`, Cachegrind
gathers the following statistics:

- I cache reads (`Ir`, which equals the number
  of instructions executed), I1 cache read misses
  (`I1mr`) and LL cache instruction read
  misses (`ILmr`).
- D cache reads (`Dr`, which equals the number
  of memory reads), D1 cache read misses
  (`D1mr`), and LL cache data read misses
  (`DLmr`).
- D cache writes (`Dw`, which equals the
  number of memory writes), D1 cache write misses
  (`D1mw`), and LL cache data write misses
  (`DLmw`).

Note that D1 total accesses is given by `D1mr` +
`D1mw`, and that LL total accesses is given by
`ILmr` + `DLmr` +
`DLmw`.

When simulating the branch predictor, with `--branch-sim=yes`,
Cachegrind gathers the following statistics:

- Conditional branches executed (`Bc`) and
  conditional branches mispredicted (`Bcm`).
- Indirect branches executed (`Bi`) and
  indirect branches mispredicted (`Bim`).

When cache and/or branch simulation is enabled, cg_annotate will print multiple
counts per line of output. For example:

```
  Ir______________________ Bc____________________ Bcm__________________ Bi____________________ Bim______________  function:file

>     8,547  (0.1%, 99.4%)     936  (0.1%, 99.1%)    177  (0.3%, 96.7%)      59  (0.0%, 99.9%) 38 (19.4%, 66.3%)  strcmp:
      8,503  (0.1%)            928  (0.1%)           175  (0.3%)             59  (0.0%)        38 (19.4%)           ./string/../sysdeps/x86_64/multiarch/../multiarch/strcmp-sse2.S
```

## 5.3. Cachegrind Command-line Options

Cachegrind-specific options are:

`--cachegrind-out-file=<file>`
:   Write the Cachegrind output file to `file` rather than
    to the default output file,
    `cachegrind.out.<pid>`. The `%p`
    and `%q` format specifiers can be used to embed the
    process ID and/or the contents of an environment variable in the name, as
    is the case for the core option
    `--log-file`.

`--cache-sim=no|yes [no]`
:   Enables or disables collection of cache access and miss counts.

`--branch-sim=no|yes [no]`
:   Enables or disables collection of branch instruction and
    misprediction counts.

`--instr-at-start=no|yes [yes]`
:   Enables or disables instrumentation at the start of execution.
    Use this in combination with
    `CACHEGRIND_START_INSTRUMENTATION` and
    `CACHEGRIND_STOP_INSTRUMENTATION` to
    measure only part of a client program's execution.

`--I1=<size>,<associativity>,<line size>`
:   Specify the size, associativity and line size of the level 1 instruction
    cache. Only useful with `--cache-sim=yes`.

`--D1=<size>,<associativity>,<line size>`
:   Specify the size, associativity and line size of the level 1 data cache.
    Only useful with `--cache-sim=yes`.

`--LL=<size>,<associativity>,<line size>`
:   Specify the size, associativity and line size of the last-level cache.
    Only useful with `--cache-sim=yes`.

## 5.4. cg_annotate Command-line Options

`-h --help`
:   Show the help message.

`--version`
:   Show the version number.

`--diff`
:   Diff two Cachegrind output files.

`--mod-filename <regex> [default: none]`
:   Specifies an `s/old/new/` search-and-replace expression
    that is applied to all filenames. Useful when differencing, for removing
    minor differences in paths between two different versions of a program
    that are sitting in different directories. An `i` suffix
    makes the regex case-insensitive, and a `g` suffix makes
    it match multiple times.

`--mod-funcname <regex> [default: none]`
:   Like `--mod-filename`, but for filenames. Useful for
    removing minor differences in randomized names of auto-generated
    functions generated by some compilers.

`--show=A,B,C [default: all, using order in the Cachegrind output file]`
:   Specifies which events to show (and the column order). Default is to use
    all present in the Cachegrind output file (and use the order in the
    file). Best used in conjunction with `--sort`.

`--sort=A,B,C [default: order in the Cachegrind output file]`
:   Specifies the events upon which the sorting of the file:function and
    function:file entries will be based.

`--threshold=X [default: 0.1%]`
:   Sets the significance threshold for the file:function and function:files
    sections. A file or function is shown if it accounts for more than X% of
    the counts for the primary sort event. If annotating source files, this
    also affects which files are annotated.

`--show-percs, --no-show-percs, --show-percs=<no|yes> [default: yes]`
:   When enabled, a percentage is printed next to all event counts. This
    helps gauge the relative importance of each function and line.

`--annotate, --no-annotate, --auto=<no|yes> [default: yes]`
:   Enables or disables source file annotation.

`--context=N [default: 8]`
:   The number of lines of context to show before and after each annotated
    line. Use a large number (e.g. 100000) to show all source lines.

## 5.5. cg_merge Command-line Options

`-o outfile`
:   Write the output to to `outfile`
    instead of standard output.

## 5.6. cg_diff Command-line Options

`-h --help`
:   Show the help message.

`--version`
:   Show the version number.

`--mod-filename=<expr> [default: none]`
:   Specifies an `s/old/new/` search-and-replace expression
    that is applied to all filenames.

`--mod-funcname=<expr> [default: none]`
:   Like `--mod-filename`, but for filenames.

## 5.7. Cachegrind Client Requests

Cachegrind provides the following client requests in
`cachegrind.h`.

`CACHEGRIND_START_INSTRUMENTATION`
:   Start Cachegrind instrumentation if not already enabled. Use this
    in combination with
    `CACHEGRIND_STOP_INSTRUMENTATION` and
    `--instr-at-start`
    to measure only part of a client program's execution.

`CACHEGRIND_STOP_INSTRUMENTATION`
:   Stop Cachegrind instrumentation if not already disabled. Use this
    in combination with
    `CACHEGRIND_START_INSTRUMENTATION` and
    `--instr-at-start`
    to measure only part of a client program's execution.

## 5.8. Simulation Details

This section talks about details you don't need to know about in order to
use Cachegrind, but may be of interest to some people.

### 5.8.1. Cache Simulation Specifics

The cache simulation approximates the hardware of an AMD Athlon CPU circa 2002.
Its specific characteristics are as follows:

- Write-allocate: when a write miss occurs, the block
  written to is brought into the D1 cache. Most modern caches
  have this property.
- Bit-selection hash function: the set of line(s) in the cache
  to which a memory block maps is chosen by the middle bits
  M--(M+N-1) of the byte address, where:

  - line size = 2^M bytes
  - (cache size / line size / associativity) = 2^N bytes
- Inclusive LL cache: the LL cache typically replicates all
  the entries of the L1 caches, because fetching into L1 involves
  fetching into LL first (this does not guarantee strict inclusiveness,
  as lines evicted from LL still could reside in L1). This is
  standard on Pentium chips, but AMD Opterons, Athlons and Durons
  use an exclusive LL cache that only holds
  blocks evicted from L1. Ditto most modern VIA CPUs.

The cache configuration simulated (cache size,
associativity and line size) is determined automatically using
the x86 CPUID instruction. If you have a machine that (a)
doesn't support the CPUID instruction, or (b) supports it in an
early incarnation that doesn't give any cache information, then
Cachegrind will fall back to using a default configuration (that
of a model 3/4 Athlon). Cachegrind will tell you if this
happens. You can manually specify one, two or all three levels
(I1/D1/LL) of the cache from the command line using the
`--I1`,
`--D1` and
`--LL` options.
For cache parameters to be valid for simulation, the number
of sets (with associativity being the number of cache lines in
each set) has to be a power of two.

On PowerPC platforms
Cachegrind cannot automatically
determine the cache configuration, so you will
need to specify it with the
`--I1`,
`--D1` and
`--LL` options.

Other noteworthy behaviour:

- References that straddle two cache lines are treated as
  follows:

  - If both blocks hit --> counted as one hit
  - If one block hits, the other misses --> counted
    as one miss.
  - If both blocks miss --> counted as one miss (not
    two)
- Instructions that modify a memory location
  (e.g. `inc` and
  `dec`) are counted as doing
  just a read, i.e. a single data reference. This may seem
  strange, but since the write can never cause a miss (the read
  guarantees the block is in the cache) it's not very
  interesting.

  Thus it measures not the number of times the data cache
  is accessed, but the number of times a data cache miss could
  occur.

If you are interested in simulating a cache with different properties, it is
not particularly hard to write your own cache simulator, or to modify the
existing ones in `cg_sim.c`.

### 5.8.2. Branch Simulation Specifics

Cachegrind simulates branch predictors intended to be
typical of mainstream desktop/server processors of around 2004.

Conditional branches are predicted using an array of 16384 2-bit
saturating counters. The array index used for a branch instruction is
computed partly from the low-order bits of the branch instruction's
address and partly using the taken/not-taken behaviour of the last few
conditional branches. As a result the predictions for any specific
branch depend both on its own history and the behaviour of previous
branches. This is a standard technique for improving prediction
accuracy.

For indirect branches (that is, jumps to unknown destinations)
Cachegrind uses a simple branch target address predictor. Targets are
predicted using an array of 512 entries indexed by the low order 9
bits of the branch instruction's address. Each branch is predicted to
jump to the same address it did last time. Any other behaviour causes
a mispredict.

More recent processors have better branch predictors, in
particular better indirect branch predictors. Cachegrind's predictor
design is deliberately conservative so as to be representative of the
large installed base of processors which pre-date widespread
deployment of more sophisticated indirect branch predictors. In
particular, late model Pentium 4s (Prescott), Pentium M, Core and Core
2 have more sophisticated indirect branch predictors than modelled by
Cachegrind.

Cachegrind does not simulate a return stack predictor. It
assumes that processors perfectly predict function return addresses,
an assumption which is probably close to being true.

See Hennessy and Patterson's classic text "Computer
Architecture: A Quantitative Approach", 4th edition (2007), Section
2.3 (pages 80-89) for background on modern branch predictors.

### 5.8.3. Accuracy

Cachegrind's instruction counting has one shortcoming on x86/amd64:

- When a `REP`-prefixed instruction executes each
  iteration is counted separately. In contrast, hardware counters count each
  such instruction just once, no matter how many times it iterates. It is
  arguable that Cachegrind's behaviour is more useful.

Cachegrind's cache profiling has a number of shortcomings:

- It doesn't account for kernel activity. The effect of system calls on the
  cache and branch predictor contents is ignored.
- It doesn't account for other process activity. This is arguably desirable
  when considering a single program.
- It doesn't account for virtual-to-physical address
  mappings. Hence the simulation is not a true
  representation of what's happening in the
  cache. Most caches and branch predictors are physically indexed, but
  Cachegrind simulates caches using virtual addresses.
- It doesn't account for cache misses not visible at the
  instruction level, e.g. those arising from TLB misses, or
  speculative execution.
- Valgrind will schedule
  threads differently from how they would be when running natively.
  This could warp the results for threaded programs.
- The x86/amd64 instructions `bts`,
  `btr` and
  `btc` will incorrectly be counted as doing a
  data read if both the arguments are registers, e.g.:

  ```
      btsl %eax, %edx
  ```

  This should only happen rarely.
- x86/amd64 FPU instructions with data sizes of 28 and 108 bytes
  (e.g. `fsave`) are treated as
  though they only access 16 bytes. These instructions seem to
  be rare so hopefully this won't affect accuracy much.

Another thing worth noting is that results are very sensitive.
Changing the size of the executable being profiled, or the sizes
of any of the shared libraries it uses, or even the length of their
file names, can perturb the results. Variations will be small, but
don't expect perfectly repeatable results if your program changes at
all.

Many Linux distributions perform address space layout randomisation (ASLR), in
which identical runs of the same program have their shared libraries loaded at
different locations, as a security measure. This also perturbs the
results.

## 5.9. Implementation Details

This section talks about details you don't need to know about in order to
use Cachegrind, but may be of interest to some people.

### 5.9.1. How Cachegrind Works

The best reference for understanding how Cachegrind works is chapter 3 of
"Dynamic Binary Analysis and Instrumentation", by Nicholas Nethercote. It
is available on the [Valgrind publications
page](http://www.valgrind.org/docs/pubs.html).

### 5.9.2. Cachegrind Output File Format

The file format is fairly straightforward, basically giving the
cost centre for every line, grouped by files and
functions. It's also totally generic and self-describing, in the sense that
it can be used for any events that can be counted on a line-by-line basis,
not just cache and branch predictor events. For example, earlier versions
of Cachegrind didn't have a branch predictor simulation. When this was
added, the file format didn't need to change at all. So the format (and
consequently, cg_annotate) could be used by other tools.

The file format:

```
file         ::= desc_line* cmd_line events_line data_line+ summary_line
desc_line    ::= "desc:" ws? non_nl_string
cmd_line     ::= "cmd:" ws? cmd
events_line  ::= "events:" ws? (event ws)+
data_line    ::= file_line | fn_line | count_line
file_line    ::= "fl=" filename
fn_line      ::= "fn=" fn_name
count_line   ::= line_num (ws+ count)* ws*
summary_line ::= "summary:" ws? count (ws+ count)+ ws*
count        ::= num
```

Where:

- `non_nl_string` is any
  string not containing a newline.
- `cmd` is a string holding the
  command line of the profiled program.
- `event` is a string containing
  no whitespace.
- `filename` and
  `fn_name` are strings.
- `num` and
  `line_num` are decimal
  numbers.
- `ws` is whitespace.

The contents of the "desc:" lines are printed out at the top
of the summary. This is a generic way of providing simulation
specific information, e.g. for giving the cache configuration for
cache simulation.

More than one line of info can be present for each file/fn/line number.
In such cases, the counts for the named events will be accumulated.

The number of counts in each
`line` and the
`summary_line` should not exceed
the number of events in the
`event_line`. If the number in
each `line` is less, cg_annotate
treats those missing as though they were a "0" entry. This can reduce
file size.

A `file_line` changes the
current file name. A `fn_line`
changes the current function name. A
`count_line` contains counts that
pertain to the current filename/fn_name. A "fn="
`file_line` and a
`fn_line` must appear before any
`count_line`s to give the context
of the first `count_line`s.

Similarly, each `file_line` must be
immediately followed by a `fn_line`.

The summary line is redundant, because it just holds the total counts
for each event. But this serves as a useful sanity check of the data; if
the totals for each event don't match the summary line, something has gone
wrong.
